"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { jerusalemLocalToUtcDate } from "@/lib/timezone";
import { sanitizePhone } from "@/lib/utils";
import { validateStatusTransition } from "@/lib/conflicts";
import type { ConflictHit } from "@/lib/conflicts";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; conflicts?: ConflictHit[] };

/** פרשנות תאריך/שעה מה־API: ISO עם Z/offset כרגיל; אחרת שעון קיר Asia/Jerusalem */
function parseIncomingDateTime(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  // כבר UTC / offset מפורש
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(s);
  if (m) {
    const d = jerusalemLocalToUtcDate(m[1], m[2]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcAgreedPrice(input: {
  pricingModel?: string | null;
  perParticipantRate?: number | null;
  expectedParticipants?: number | null;
  agreedPrice?: number | null;
}): number | null {
  if (input.pricingModel === "per_participant") {
    const rate = input.perParticipantRate ?? 0;
    const count = input.expectedParticipants ?? 0;
    return rate * count;
  }
  return input.agreedPrice ?? null;
}

/** יוצר / מעדכן פרופיל מדריך ומחזיר id — תעריף חי כמקור אמת */
export async function ensureInstructor(
  name: string,
  fee?: number | null,
): Promise<ActionResult<{ id: string; name: string; fee: number }>> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "שם מדריך חסר" };
  }
  try {
    const existing = await prisma.instructor.findUnique({
      where: { name: trimmed },
    });
    if (existing) {
      const nextFee =
        fee != null && Number.isFinite(Number(fee))
          ? Math.max(0, Number(fee))
          : existing.fee;
      const updated =
        nextFee !== existing.fee
          ? await prisma.instructor.update({
              where: { id: existing.id },
              data: { fee: nextFee, active: true },
            })
          : existing;
      return {
        ok: true,
        data: { id: updated.id, name: updated.name, fee: updated.fee },
      };
    }
    const created = await prisma.instructor.create({
      data: {
        name: trimmed,
        fee: fee != null && Number.isFinite(Number(fee)) ? Math.max(0, Number(fee)) : 0,
        active: true,
      },
    });
    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/instructors");
    return {
      ok: true,
      data: { id: created.id, name: created.name, fee: created.fee },
    };
  } catch (err) {
    console.error("[ensureInstructor]", err);
    return { ok: false, error: "לא ניתן לשמור פרופיל מדריך" };
  }
}

export async function updateInstructorFee(
  id: string,
  fee: number,
): Promise<ActionResult<{ id: string; fee: number }>> {
  try {
    const updated = await prisma.instructor.update({
      where: { id },
      data: { fee: Math.max(0, Number(fee) || 0) },
    });
    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/instructors");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: updated.id, fee: updated.fee } };
  } catch (err) {
    console.error("[updateInstructorFee]", err);
    return { ok: false, error: "לא ניתן לעדכן תעריף מדריך" };
  }
}

async function ensureNetFollowUp(leadId: string, paymentTerms: string | null | undefined) {
  if (paymentTerms !== "net_30" && paymentTerms !== "net_60") return;
  const days = paymentTerms === "net_30" ? 30 : 60;
  const dueDate = addDays(new Date(), days);
  const existing = await prisma.followUpTask.findFirst({
    where: { leadId, title: { contains: "Net+" }, completed: false },
  });
  if (existing) {
    await prisma.followUpTask.update({
      where: { id: existing.id },
      data: { dueDate, title: `תזכורת תשלום ${paymentTerms.toUpperCase()}` },
    });
  } else {
    await prisma.followUpTask.create({
      data: {
        leadId,
        title: `תזכורת תשלום ${paymentTerms.toUpperCase()}`,
        dueDate,
      },
    });
  }
}

export async function checkDuplicatePhone(phone: string, excludeLeadId?: string) {
  const sanitized = sanitizePhone(phone);
  if (!sanitized || sanitized.length < 9) return { duplicates: [] as { id: string; fullName: string }[] };

  const duplicates = await prisma.lead.findMany({
    where: {
      phone: sanitized,
      id: excludeLeadId ? { not: excludeLeadId } : undefined,
      courseStatus: { not: "canceled" },
    },
    select: { id: true, fullName: true },
    take: 5,
  });
  return { duplicates };
}

export async function createLead(formData: FormData): Promise<
  ActionResult<{ id: string }> & { fieldErrors?: { fullName?: string; phone?: string }; duplicate?: { id: string; fullName: string } }
> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = sanitizePhone(phoneRaw);

  const fieldErrors: { fullName?: string; phone?: string } = {};
  if (!fullName) fieldErrors.fullName = "שדה חובה";
  if (!phone) fieldErrors.phone = "שדה חובה";

  if (fieldErrors.fullName || fieldErrors.phone) {
    return {
      ok: false,
      error: "שם מלא וטלפון הם שדות חובה",
      code: "required_fields",
      fieldErrors,
    };
  }

  const { duplicates } = await checkDuplicatePhone(phone);
  if (duplicates.length > 0) {
    const dup = duplicates[0];
    return {
      ok: false,
      error: `קיים כבר ליד פעיל בשם ${dup.fullName}`,
      code: "duplicate_phone",
      duplicate: dup,
    };
  }

  const lead = await prisma.lead.create({
    data: {
      fullName,
      phone,
      email: String(formData.get("email") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      leadSource: String(formData.get("leadSource") ?? "") || null,
      urgency: "normal",
      activityType: String(formData.get("activityType") ?? "course"),
      notes: String(formData.get("notes") ?? "") || null,
    },
  });

  revalidatePath("/");
  revalidatePath("/leads");
  return { ok: true, data: { id: lead.id } };
}

export async function updateLead(
  leadId: string,
  raw: Record<string, unknown>,
  opts: { bypassConflict?: boolean } = {}
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) return { ok: false, error: "ליד לא נמצא" };

  const phone = raw.phone != null ? sanitizePhone(String(raw.phone)) : existing.phone;
  const fullName =
    raw.fullName != null ? String(raw.fullName).trim() : existing.fullName;

  if (!fullName || !phone) {
    return {
      ok: false,
      error: "שם מלא וטלפון הם שדות חובה",
      code: "required_fields",
    };
  }

  if (phone !== existing.phone) {
    const { duplicates } = await checkDuplicatePhone(phone, leadId);
    if (duplicates.length > 0) {
      return {
        ok: false,
        error: `קיים כבר ליד פעיל בשם ${duplicates[0].fullName}`,
        code: "duplicate_phone",
      };
    }
  }

  const nextStatus =
    raw.courseStatus != null ? String(raw.courseStatus) : existing.courseStatus;


  const merged = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(raw).map(([k, v]) => {
        if (v === "" || v === undefined) return [k, null];
        return [k, v];
      })
    ),
    phone,
    courseStatus: nextStatus,
  } as typeof existing;

  // Coerce numeric / date fields — מחרוזות ללא offset נחשבות שעון ישראל
  if (raw.scheduledStart != null && raw.scheduledStart !== "") {
    merged.scheduledStart = parseIncomingDateTime(raw.scheduledStart) ?? existing.scheduledStart;
  }
  if (raw.scheduledEnd != null && raw.scheduledEnd !== "") {
    merged.scheduledEnd = parseIncomingDateTime(raw.scheduledEnd) ?? existing.scheduledEnd;
  }
  if (raw.expectedParticipants != null && raw.expectedParticipants !== "") {
    merged.expectedParticipants = Number(raw.expectedParticipants);
  }
  if (raw.sessionsCount != null && raw.sessionsCount !== "") {
    merged.sessionsCount = Number(raw.sessionsCount);
  }
  if (raw.perParticipantRate != null && raw.perParticipantRate !== "") {
    merged.perParticipantRate = Number(raw.perParticipantRate);
  }
  if (raw.extraParticipantPrice != null && raw.extraParticipantPrice !== "") {
    merged.extraParticipantPrice = Number(raw.extraParticipantPrice);
  }
  if (raw.agreedPrice != null && raw.agreedPrice !== "") {
    merged.agreedPrice = Number(raw.agreedPrice);
  }
  if (raw.kindergartenApproved != null) {
    merged.kindergartenApproved = Boolean(raw.kindergartenApproved);
  }
  if (raw.bookletRequired != null) {
    merged.bookletRequired = Boolean(raw.bookletRequired);
  }
  if (raw.collectCertificateShipping != null) {
    merged.collectCertificateShipping = Boolean(raw.collectCertificateShipping);
  }

  if (nextStatus !== existing.courseStatus) {
    const validation = await validateStatusTransition(merged, nextStatus, {
      bypassConflict: opts.bypassConflict,
    });
    if (validation) {
      if (validation.code === "conflict") {
        return {
          ok: false,
          error: validation.message,
          code: "conflict",
          conflicts: validation.conflicts,
        };
      }
      return { ok: false, error: validation.message, code: validation.code };
    }
  }

  // Physical address on save when delivery is physical
  if (
    (merged.deliveryMethod === "physical_print" || merged.deliveryMethod === "postal_mail") &&
    nextStatus === "closed"
  ) {
    // soft check only on closed_won is enforced in validateStatusTransition
  }

  // מחיר גלובלי: שומרים את agreedPrice שנשלח מהטופס.
  // למשתתף: מחשבים rate × כמות (או agreedPrice אם נשלח במפורש).
  const agreedPrice =
    merged.pricingModel === "per_participant" &&
    (raw.agreedPrice === undefined || raw.agreedPrice === null || raw.agreedPrice === "")
      ? calcAgreedPrice({
          pricingModel: merged.pricingModel,
          perParticipantRate: merged.perParticipantRate,
          expectedParticipants: merged.expectedParticipants,
          agreedPrice: merged.agreedPrice,
        })
      : merged.agreedPrice != null
        ? Number(merged.agreedPrice)
        : calcAgreedPrice({
            pricingModel: merged.pricingModel,
            perParticipantRate: merged.perParticipantRate,
            expectedParticipants: merged.expectedParticipants,
            agreedPrice: merged.agreedPrice,
          });

  let quoteSentAt = existing.quoteSentAt;
  if (merged.quoteStatus === "sent" && existing.quoteStatus !== "sent") {
    quoteSentAt = new Date();
  }

  // Google Calendar: manual export via TEMPLATE link in UI (no background sync)

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      fullName,
      phone,
      phoneSecondary:
        raw.phoneSecondary !== undefined
          ? raw.phoneSecondary
            ? sanitizePhone(String(raw.phoneSecondary)) || null
            : null
          : existing.phoneSecondary,
      email: merged.email,
      city: merged.city,
      leadSource: merged.leadSource,
      urgency: "normal",
      activityType: merged.activityType ?? "course",
      courseStatus: nextStatus,
      equipmentStatus: merged.equipmentStatus,
      reason: merged.reason,
      courseType: merged.courseType,
      courseTypeOther: merged.courseTypeOther,
      courseCategory: merged.courseCategory,
      courseCategoryOther: merged.courseCategoryOther,
      kindergartenApproved: Boolean(merged.kindergartenApproved),
      expectedParticipants: merged.expectedParticipants,
      sessionsCount: merged.sessionsCount,
      sessionDuration: merged.sessionDuration,
      sessionDurationOther: merged.sessionDurationOther,
      bookletRequired: Boolean(merged.bookletRequired),
      scheduledStart: merged.scheduledStart,
      scheduledEnd: merged.scheduledEnd,
      location: merged.location,
      instructor: merged.instructor,
      instructorId:
        raw.instructorId !== undefined
          ? raw.instructorId
            ? String(raw.instructorId)
            : null
          : existing.instructorId,
      instructorFeeOverride:
        raw.instructorFeeOverride !== undefined
          ? raw.instructorFeeOverride == null || raw.instructorFeeOverride === ""
            ? null
            : Number(raw.instructorFeeOverride)
          : existing.instructorFeeOverride,
      pricingModel: merged.pricingModel ?? "flat_rate",
      perParticipantRate: merged.perParticipantRate,
      extraParticipantPrice:
        merged.extraParticipantPrice != null
          ? Number(merged.extraParticipantPrice)
          : 50,
      agreedPrice,
      quoteStatus: merged.quoteStatus ?? "not_sent",
      quoteSentAt,
      paymentTerms: merged.paymentTerms,
      paymentStatus: merged.paymentStatus ?? "pending_official_order",
      shippingStreet: merged.shippingStreet,
      shippingHouseNo: merged.shippingHouseNo,
      shippingCity: merged.shippingCity,
      shippingZip: merged.shippingZip,
      deliveryMethod: merged.deliveryMethod,
      notes: merged.notes,
      collectCertificateShipping: Boolean(merged.collectCertificateShipping),
      conflictBypassed: Boolean(opts.bypassConflict) || existing.conflictBypassed,
    },
  });

  await ensureNetFollowUp(leadId, merged.paymentTerms);

  // Returning account classification when closing won
  if (nextStatus === "closed_won" && existing.accountId) {
    await prisma.account.update({
      where: { id: existing.accountId },
      data: { classification: "returning" },
    });
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/p/${leadId}`);
  revalidatePath("/dashboard");
  return { ok: true, data: { id: leadId } };
}

async function upsertTraineeFromParticipant(data: {
  fullName: string;
  idNumber: string;
  email?: string | null;
  phone?: string | null;
}) {
  const idNumber = data.idNumber.trim();
  const fullName = data.fullName.trim();
  return prisma.trainee.upsert({
    where: { idNumber },
    create: {
      fullName,
      idNumber,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
    },
    update: {
      fullName,
      email: data.email?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
    },
  });
}

export async function addParticipant(leadId: string, fullName: string, idNumber: string) {
  if (!fullName.trim() || !idNumber.trim()) {
    return { ok: false as const, error: "שם מלא ות.ז. הם שדות חובה" };
  }
  // מודרך גלובלי נוצר רק לאחר אישור נוכחות
  await prisma.participant.create({
    data: {
      leadId,
      fullName: fullName.trim(),
      idNumber: idNumber.trim(),
    },
  });
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (lead?.courseStatus === "completed") {
    await prisma.lead.update({
      where: { id: leadId },
      data: { courseStatus: "certificates_pending" },
    });
  }
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}

export async function setCollectCertificateShipping(
  leadId: string,
  collect: boolean,
): Promise<ActionResult<{ collectCertificateShipping: boolean }>> {
  await prisma.lead.update({
    where: { id: leadId },
    data: { collectCertificateShipping: collect },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/p/${leadId}`);
  return { ok: true, data: { collectCertificateShipping: collect } };
}

export type PublicParticipantInput = {
  organizerName: string;
  fullName: string;
  idNumber: string;
  courseDate: string;
  email: string;
  phone: string;
  satisfaction: string;
  feedback: string;
  kitInterest: string;
  shippingCity?: string;
  shippingStreet?: string;
  shippingHouseNo?: string;
  shippingZip?: string;
};

export async function submitPublicParticipant(
  leadId: string,
  data: PublicParticipantInput,
): Promise<ActionResult<{ id: string }>> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "ההדרכה לא נמצאה" };

  const allowed = ["closed", "completed", "certificates_pending", "closed_won"];
  if (!allowed.includes(lead.courseStatus)) {
    return { ok: false, error: "לא ניתן להירשם להדרכה זו כרגע" };
  }

  if (!data.fullName?.trim() || !data.idNumber?.trim()) {
    return { ok: false, error: "שם מלא ותעודת זהות הם שדות חובה" };
  }
  if (!data.organizerName?.trim()) {
    return { ok: false, error: "שם מארגן / מזמין הקורס הוא שדה חובה" };
  }
  if (!data.email?.trim() || !data.phone?.trim()) {
    return { ok: false, error: "דוא״ל וטלפון הם שדות חובה" };
  }
  if (!data.satisfaction?.trim() || !data.kitInterest?.trim()) {
    return { ok: false, error: "יש לבחור שביעות רצון והתעניינות בתיק" };
  }
  if (!data.courseDate?.trim()) {
    return { ok: false, error: "תאריך ביצוע הקורס הוא שדה חובה" };
  }

  if (lead.collectCertificateShipping) {
    if (
      !data.shippingCity?.trim() ||
      !data.shippingStreet?.trim() ||
      !data.shippingHouseNo?.trim() ||
      !data.shippingZip?.trim()
    ) {
      return { ok: false, error: "יש למלא כתובת מלאה ומיקוד למשלוח התעודה" };
    }
  }

  const created = await prisma.participant.create({
    data: {
      leadId,
      fullName: data.fullName.trim(),
      idNumber: data.idNumber.trim(),
      organizerName: data.organizerName.trim(),
      courseDate: data.courseDate.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      satisfaction: data.satisfaction.trim(),
      feedback: data.feedback?.trim() || null,
      kitInterest: data.kitInterest.trim(),
      shippingCity: data.shippingCity?.trim() || null,
      shippingStreet: data.shippingStreet?.trim() || null,
      shippingHouseNo: data.shippingHouseNo?.trim() || null,
      shippingZip: data.shippingZip?.trim() || null,
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/p/${leadId}`);
  return { ok: true, data: { id: created.id } };
}

export async function setParticipantAttended(
  participantId: string,
  leadId: string,
  attended: boolean,
): Promise<ActionResult<{ attended: boolean }>> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
  });
  if (!participant) return { ok: false, error: "משתתף לא נמצא" };

  let traineeId = participant.traineeId;
  if (attended && !traineeId) {
    const trainee = await upsertTraineeFromParticipant({
      fullName: participant.fullName,
      idNumber: participant.idNumber,
      email: participant.email,
      phone: participant.phone,
    });
    traineeId = trainee.id;
  }

  await prisma.participant.update({
    where: { id: participantId },
    data: { attended, traineeId: traineeId || null },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return { ok: true, data: { attended } };
}

export async function updateParticipantDetails(
  participantId: string,
  leadId: string,
  data: {
    fullName?: string;
    idNumber?: string;
    phone?: string;
    email?: string;
    feedback?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await prisma.participant.update({
    where: { id: participantId },
    data: {
      fullName: data.fullName?.trim(),
      idNumber: data.idNumber?.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      feedback: data.feedback?.trim() || null,
    },
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, data: { id: participantId } };
}

export async function fetchLeadParticipants(leadId: string) {
  const rows = await prisma.participant.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.fullName,
    idNumber: p.idNumber,
    organizerName: p.organizerName || undefined,
    courseDate: p.courseDate || undefined,
    email: p.email || undefined,
    phone: p.phone || undefined,
    satisfaction: p.satisfaction || undefined,
    feedback: p.feedback || undefined,
    kitInterest: p.kitInterest || undefined,
    shippingCity: p.shippingCity || undefined,
    shippingStreet: p.shippingStreet || undefined,
    shippingHouseNo: p.shippingHouseNo || undefined,
    shippingZip: p.shippingZip || undefined,
    attended: Boolean(p.attended),
    traineeId: p.traineeId || undefined,
  }));
}

export async function updateTrainee(
  id: string,
  data: {
    certificateEmailSent?: boolean;
    certificateCardPrinted?: boolean;
    notes?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await prisma.trainee.update({
    where: { id },
    data: {
      certificateEmailSent: data.certificateEmailSent,
      certificateCardPrinted: data.certificateCardPrinted,
      notes: data.notes === undefined ? undefined : data.notes.trim() || null,
    },
  });
  revalidatePath("/clients");
  return { ok: true, data: { id } };
}

async function recomputeCompositeCost(parentId: string) {
  const comps = await prisma.inventoryComponent.findMany({
    where: { parentId },
    include: { child: true },
  });
  const cost = comps.reduce((s, c) => {
    const unit = Number(c.child.costPrice) || Number(c.child.sellingPrice) || 0;
    return s + unit * (c.quantity || 0);
  }, 0);
  await prisma.inventoryItem.update({
    where: { id: parentId },
    data: { costPrice: cost, isComposite: true },
  });
  return cost;
}

export async function upsertInventoryItem(data: {
  id?: string;
  name: string;
  category?: string;
  sellingPrice: number;
  costPrice: number;
  supplierName?: string;
  isComposite?: boolean;
  components?: { childId: string; quantity: number }[];
}): Promise<ActionResult<{ id: string }>> {
  if (!data.name.trim()) return { ok: false, error: "שם פריט הוא שדה חובה" };

  const base = {
    name: data.name.trim(),
    category: data.category?.trim() || null,
    sellingPrice: Number(data.sellingPrice) || 0,
    costPrice: Number(data.costPrice) || 0,
    supplierName: data.supplierName?.trim() || null,
    isComposite: Boolean(data.isComposite),
  };

  let id = data.id;
  if (id) {
    await prisma.inventoryItem.update({ where: { id }, data: base });
  } else {
    const created = await prisma.inventoryItem.create({ data: base });
    id = created.id;
  }

  if (data.isComposite && data.components) {
    await prisma.inventoryComponent.deleteMany({ where: { parentId: id } });
    for (const c of data.components) {
      if (!c.childId || c.childId === id) continue;
      await prisma.inventoryComponent.create({
        data: {
          parentId: id,
          childId: c.childId,
          quantity: Number(c.quantity) || 1,
        },
      });
    }
    await recomputeCompositeCost(id);
  }

  revalidatePath("/equipment");
  revalidatePath("/");
  return { ok: true, data: { id } };
}

/** כמה מכירות מקושרות לפריט מלאי — לפני מחיקה */
export async function getInventoryItemSaleCount(
  id: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    const count = await prisma.trainingSale.count({
      where: { inventoryItemId: id },
    });
    return { ok: true, data: { count } };
  } catch (err) {
    console.error("[getInventoryItemSaleCount]", err);
    return { ok: false, error: "לא ניתן לבדוק היסטוריית מכירות" };
  }
}

export async function deleteInventoryItem(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await prisma.inventoryItem.delete({ where: { id } });
    revalidatePath("/equipment");
    revalidatePath("/leads");
    revalidatePath("/");
    return { ok: true, data: { id } };
  } catch (err) {
    console.error("[deleteInventoryItem]", err);
    return {
      ok: false,
      error: "לא ניתן למחוק את הפריט — ייתכן שהוא מקושר לרשומות אחרות",
    };
  }
}

export async function addTrainingSale(
  leadId: string | null,
  inventoryItemId: string,
  quantity: number,
  unitSellingPrice?: number,
): Promise<ActionResult<{ id: string }>> {
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));
  if (!qty) return { ok: false, error: "כמות חייבת להיות לפחות 1" };

  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
  });
  if (!item) return { ok: false, error: "הפריט לא נמצא במלאי" };

  const unitCost =
    Number(item.costPrice) || Number(item.sellingPrice) || 0;
  const unitSell =
    unitSellingPrice != null && !Number.isNaN(Number(unitSellingPrice))
      ? Number(unitSellingPrice)
      : unitCost;

  // זכירת מחיר מכירה אחרון על הפריט
  await prisma.inventoryItem.update({
    where: { id: inventoryItemId },
    data: { sellingPrice: unitSell },
  });

  const created = await prisma.trainingSale.create({
    data: {
      leadId: leadId || null,
      inventoryItemId,
      quantity: qty,
      unitSellingPrice: unitSell,
      unitCostPrice: unitCost,
    },
  });

  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/equipment");
  return { ok: true, data: { id: created.id } };
}

export async function deleteTrainingSale(
  id: string,
  leadId: string,
): Promise<ActionResult<{ id: string }>> {
  await prisma.trainingSale.delete({ where: { id } });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { ok: true, data: { id } };
}

export async function removeParticipant(id: string, leadId: string) {
  await prisma.participant.delete({ where: { id } });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}

export async function addExpense(
  leadId: string,
  data: { type: string; amount: number; notes?: string }
) {
  if (!data.type || !data.amount || data.amount <= 0) {
    return { ok: false as const, error: "סוג סכום וסכום חיובי הם שדות חובה" };
  }
  await prisma.expense.create({
    data: {
      leadId,
      type: data.type,
      amount: data.amount,
      notes: data.notes || null,
    },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function deleteExpense(id: string, leadId: string) {
  await prisma.expense.delete({ where: { id } });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function updateSettings(data: {
  businessName?: string;
  websiteUrl?: string;
  googleReviewUrl?: string;
  tiktokUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  lmsApiUrl?: string;
  lmsLoginUrl?: string;
  calendarEnabled?: boolean;
}) {
  await prisma.settings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function upsertCourseAsset(data: {
  courseType: string;
  title?: string;
  hours?: number;
  audience?: string;
  durationText?: string;
  natureText?: string;
  contents?: string;
  pricingText?: string;
  summaryTemplate?: string;
  bookletUrl?: string;
  presentationUrl?: string;
  syllabusUrl?: string;
}) {
  if (!data.courseType.trim()) {
    return { ok: false as const, error: "סוג קורס הוא שדה חובה" };
  }

  const payload = {
    title: data.title ?? "",
    hours: data.hours ?? 0,
    audience: data.audience || null,
    durationText: data.durationText || null,
    natureText: data.natureText || null,
    contents: data.contents || null,
    pricingText: data.pricingText || null,
    summaryTemplate: data.summaryTemplate || null,
    bookletUrl: data.bookletUrl || null,
    presentationUrl: data.presentationUrl || null,
    syllabusUrl: data.syllabusUrl || null,
  };

  await prisma.courseAsset.upsert({
    where: { courseType: data.courseType },
    create: { courseType: data.courseType, ...payload },
    update: payload,
  });

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/leads");
  return { ok: true as const };
}

export async function createLmsUser(leadId: string): Promise<
  ActionResult<{ username: string; password: string; loginUrl: string; message: string }>
> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "ליד לא נמצא" };
  if (!lead.email) return { ok: false, error: "נדרש אימייל ליצירת משתמש LMS" };

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const password = `Ezra${Math.random().toString(36).slice(2, 8)}!`;
  const loginUrl = settings?.lmsLoginUrl || "https://lms.example.com/login";

  // Stub external LMS API call
  if (settings?.lmsApiUrl) {
    try {
      await fetch(settings.lmsApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: lead.fullName,
          email: lead.email,
          phone: lead.phone,
          course_id: lead.courseType,
        }),
      });
    } catch {
      console.warn("[lms] API request failed – credentials generated locally");
    }
  }

  const { lmsWelcomeMessage } = await import("@/lib/whatsapp");
  const message = lmsWelcomeMessage({
    fullName: lead.fullName,
    email: lead.email,
    password,
    loginUrl,
  });

  return {
    ok: true,
    data: { username: lead.email, password, loginUrl, message },
  };
}

export async function createTask(data: {
  leadId?: string;
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  notes?: string;
  assignee?: string;
}): Promise<
  ActionResult<{
    id: string;
    title: string;
    dueDate: string | null;
    assignee: string;
    notes: string;
  }>
> {
  const title = data.title.trim();
  if (!title) return { ok: false, error: "יש להזין תיאור משימה" };

  let dueDate: Date | null = null;
  if (data.date?.trim()) {
    const time = data.time?.trim() || "09:00";
    dueDate = jerusalemLocalToUtcDate(data.date.trim(), time);
    if (Number.isNaN(dueDate.getTime())) {
      return { ok: false, error: "תאריך/שעה לא תקינים" };
    }
  }

  const task = await prisma.followUpTask.create({
    data: {
      leadId: data.leadId || null,
      title,
      dueDate,
      assignee: data.assignee || "מכירות",
      notes: data.notes || null,
    },
  });

  if (data.leadId) revalidatePath(`/leads/${data.leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return {
    ok: true,
    data: {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate?.toISOString() ?? null,
      assignee: task.assignee ?? "מכירות",
      notes: task.notes ?? "",
    },
  };
}

/**
 * מוחק אירוע מלוח הזמנים:
 * - task → מוחק FollowUpTask
 * - training → מנקה תאריך/שעה מתוזמנים מהליד (בלי למחוק את הליד)
 */
export async function deleteScheduleEvent(data: {
  kind: "task" | "training";
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  if (data.kind === "task") {
    const existing = await prisma.followUpTask.findUnique({ where: { id: data.id } });
    if (!existing) return { ok: false, error: "המשימה לא נמצאה" };
    await prisma.followUpTask.delete({ where: { id: data.id } });
    if (existing.leadId) revalidatePath(`/leads/${existing.leadId}`);
  } else {
    const existing = await prisma.lead.findUnique({ where: { id: data.id } });
    if (!existing) return { ok: false, error: "ההדרכה לא נמצאה" };
    await prisma.lead.update({
      where: { id: data.id },
      data: { scheduledStart: null, scheduledEnd: null },
    });
    revalidatePath(`/leads/${data.id}`);
    revalidatePath("/leads");
    revalidatePath("/trainings");
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
}

/** @deprecated use createTask */
export async function createCallBackTask(leadId: string): Promise<
  ActionResult<{
    id: string;
    title: string;
    dueDate: string;
    assignee: string;
    notes: string;
  }>
> {
  const res = await createTask({
    leadId,
    title: "להתקשר שוב",
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    time: "10:00",
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      ...res.data,
      dueDate: res.data.dueDate ?? new Date().toISOString(),
    },
  };
}

export async function getOrCreateAccountForLead(leadId: string, accountName: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false as const, error: "ליד לא נמצא" };

  let account = await prisma.account.findFirst({
    where: { name: accountName.trim() },
  });
  if (!account) {
    account = await prisma.account.create({
      data: {
        name: accountName.trim(),
        city: lead.city,
        classification: "new",
      },
    });
  }

  const contact = await prisma.contact.create({
    data: {
      accountId: account.id,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { accountId: account.id, contactId: contact.id },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/accounts/${account.id}`);
  return { ok: true as const, data: { accountId: account.id } };
}
