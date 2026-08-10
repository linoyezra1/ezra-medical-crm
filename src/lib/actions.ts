"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { getActiveCrmUser } from "@/lib/crm-user-server";
import { formatCourseTypeLabel } from "@/lib/course-type";
import {
  ASSIGN_INSTRUCTOR_TASK_PREFIX,
  assignInstructorTaskTitle,
  isInstructorUnassigned,
} from "@/lib/instructor";
import { formatInJerusalem, jerusalemLocalToUtcDate } from "@/lib/timezone";
import {
  PAID_PAYMENT_STATUS,
  TRAINING_SALE_PAID,
  TRAINING_SALE_PENDING_PAYMENT,
  unpaidTrainingSaleTaskNotes,
  unpaidTrainingSaleTaskTitle,
  UNPAID_PAYMENT_TASK_PREFIX,
  isLeadPaid,
  unpaidPaymentTaskTitle,
  parseSessionsJson,
} from "@/lib/payment";
import { sanitizePhone } from "@/lib/utils";
import { validateStatusTransition } from "@/lib/conflicts";
import type { ConflictHit } from "@/lib/conflicts";
import {
  exportLeadParticipantsToSheets,
  syncCertificateFlagsFromSheets,
  tryAutoCompleteTrainingIfReady,
  exportTraineesToCertificateSheet,
} from "@/lib/google-sheets/certificates";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets/client";
import {
  dbStatusToUi,
  previousLeadStatus,
  uiStatusToDb,
} from "@/lib/types";

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

/** משימה אוטומטית כשאין מדריך משובץ; סוגרת אותה כששובץ */
async function syncUnassignedInstructorTask(lead: {
  id: string;
  fullName: string;
  instructor: string | null;
  courseType: string | null;
  courseTypeOther: string | null;
  scheduledStart: Date | null;
}) {
  const courseLabel = formatCourseTypeLabel(lead.courseType || "", {
    other: lead.courseTypeOther,
  });
  const title = assignInstructorTaskTitle(lead.fullName, courseLabel);

  if (isInstructorUnassigned(lead.instructor)) {
    let dueDate: Date | null = null;
    if (lead.scheduledStart) {
      const { date } = formatInJerusalem(lead.scheduledStart);
      if (date) dueDate = jerusalemLocalToUtcDate(date, "09:00");
    }

    const existing = await prisma.followUpTask.findFirst({
      where: {
        leadId: lead.id,
        completed: false,
        title: { startsWith: ASSIGN_INSTRUCTOR_TASK_PREFIX },
      },
    });

    if (existing) {
      await prisma.followUpTask.update({
        where: { id: existing.id },
        data: { title, dueDate },
      });
    } else {
      await prisma.followUpTask.create({
        data: {
          leadId: lead.id,
          title,
          dueDate,
          assignee: "מכירות",
          notes: "נוצר אוטומטית — טרם שובץ מדריך",
        },
      });
    }
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return;
  }

  await prisma.followUpTask.updateMany({
    where: {
      leadId: lead.id,
      completed: false,
      title: { startsWith: ASSIGN_INSTRUCTOR_TASK_PREFIX },
    },
    data: { completed: true },
  });
}

/** משימת גבייה אוטומטית כל עוד ההדרכה לא שולמה */
async function syncUnpaidPaymentTask(lead: {
  id: string;
  fullName: string;
  paymentStatus: string | null;
  scheduledStart: Date | null;
}) {
  const title = unpaidPaymentTaskTitle(lead.fullName);

  if (!isLeadPaid(lead)) {
    let dueDate: Date | null = null;
    if (lead.scheduledStart) {
      const { date } = formatInJerusalem(lead.scheduledStart);
      if (date) dueDate = jerusalemLocalToUtcDate(date, "09:00");
    }

    const existing = await prisma.followUpTask.findFirst({
      where: {
        leadId: lead.id,
        completed: false,
        title: { startsWith: UNPAID_PAYMENT_TASK_PREFIX },
      },
    });

    if (existing) {
      await prisma.followUpTask.update({
        where: { id: existing.id },
        data: { title, dueDate },
      });
    } else {
      await prisma.followUpTask.create({
        data: {
          leadId: lead.id,
          title,
          dueDate,
          assignee: "מכירות",
          notes: "נוצר אוטומטית — ממתין לתשלום",
        },
      });
    }
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return;
  }

  await prisma.followUpTask.updateMany({
    where: {
      leadId: lead.id,
      completed: false,
      title: { startsWith: UNPAID_PAYMENT_TASK_PREFIX },
    },
    data: { completed: true },
  });
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

  const actor = await getActiveCrmUser();
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
      createdBy: actor,
      lastUpdatedBy: actor,
    },
  });

  await prisma.activityLog.create({
    data: {
      leadId: lead.id,
      performedBy: actor,
      previousStatus: null,
      newStatus: lead.courseStatus,
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

  const merged = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(raw).map(([k, v]) => {
        if (v === "" || v === undefined) return [k, null];
        return [k, v];
      })
    ),
    phone,
    courseStatus:
      raw.courseStatus != null
        ? String(raw.courseStatus)
        : existing.courseStatus,
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

  let nextStatus = String(merged.courseStatus ?? existing.courseStatus);

  // אוטומציה: מעבר ל־"בוצעה" (DB completed) → "ממתין לתעודות"
  if (
    nextStatus === "completed" &&
    existing.courseStatus !== "completed" &&
    existing.courseStatus !== "certificates_pending" &&
    existing.courseStatus !== "closed_won"
  ) {
    nextStatus = "certificates_pending";
    merged.courseStatus = "certificates_pending";
  }

  // חסימת "הסתיים" ללא תשלום
  if (
    nextStatus === "closed_won" &&
    existing.courseStatus !== "closed_won"
  ) {
    const paid =
      String(merged.paymentStatus ?? existing.paymentStatus) ===
      PAID_PAYMENT_STATUS;
    if (!paid) {
      return {
        ok: false,
        error:
          "לא ניתן לסמן הדרכה כ״הסתיים״ לפני שבוצע תשלום. יש לרשום תשלום תחילה.",
        code: "payment_required",
      };
    }
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

  const actor = await getActiveCrmUser();
  const statusChanged = nextStatus !== existing.courseStatus;
  const closedByValue =
    nextStatus === "closed"
      ? actor
      : existing.closedBy;

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
      paymentDate:
        raw.paymentDate !== undefined
          ? raw.paymentDate
            ? jerusalemLocalToUtcDate(
                String(raw.paymentDate).slice(0, 10),
                "12:00",
              )
            : null
          : existing.paymentDate,
      paymentMethod:
        raw.paymentMethod !== undefined
          ? raw.paymentMethod
            ? String(raw.paymentMethod)
            : null
          : existing.paymentMethod,
      paymentReceivedBy:
        raw.paymentReceivedBy !== undefined
          ? raw.paymentReceivedBy
            ? String(raw.paymentReceivedBy)
            : null
          : existing.paymentReceivedBy,
      paymentReceiptIssued:
        raw.paymentReceiptIssued !== undefined
          ? Boolean(raw.paymentReceiptIssued)
          : existing.paymentReceiptIssued,
      isPrivateCourse:
        raw.isPrivateCourse !== undefined
          ? Boolean(raw.isPrivateCourse)
          : existing.isPrivateCourse,
      sessionsJson:
        raw.sessionsJson !== undefined
          ? raw.sessionsJson
            ? String(raw.sessionsJson)
            : null
          : existing.sessionsJson,
      shippingStreet: merged.shippingStreet,
      shippingHouseNo: merged.shippingHouseNo,
      shippingCity: merged.shippingCity,
      shippingZip: merged.shippingZip,
      deliveryMethod: merged.deliveryMethod,
      notes: merged.notes,
      collectCertificateShipping: Boolean(merged.collectCertificateShipping),
      conflictBypassed: Boolean(opts.bypassConflict) || existing.conflictBypassed,
      lastUpdatedBy: actor,
      closedBy: closedByValue,
      assignedTo:
        raw.assignedTo !== undefined
          ? raw.assignedTo
            ? String(raw.assignedTo)
            : null
          : existing.assignedTo,
    },
  });

  if (statusChanged) {
    await prisma.activityLog.create({
      data: {
        leadId,
        performedBy: actor,
        previousStatus: existing.courseStatus,
        newStatus: nextStatus,
      },
    });
  }

  await ensureNetFollowUp(leadId, merged.paymentTerms);

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      fullName: true,
      instructor: true,
      courseType: true,
      courseTypeOther: true,
      scheduledStart: true,
      paymentStatus: true,
    },
  });
  if (after) {
    await syncUnassignedInstructorTask(after);
    await syncUnpaidPaymentTask(after);
  }

  // ייצוא ל-Google Sheets בעת מעבר ל״ממתין לתעודות״
  if (
    nextStatus === "certificates_pending" &&
    existing.courseStatus !== "certificates_pending"
  ) {
    if (!isGoogleSheetsConfigured()) {
      console.error(
        "[sheets export] דילוג — Google Sheets לא מוגדר (בדקו GOOGLE_CREDENTIALS / GOOGLE_SHEETS_SPREADSHEET_ID)",
      )
    } else {
      const exportRes = await exportLeadParticipantsToSheets(leadId)
      if (!exportRes.ok) {
        console.error("[sheets export]", exportRes.error)
      } else if (exportRes.exported === 0) {
        console.warn(
          "[sheets export] אין משתתפים חדשים לייצוא (או שכבר יוצאו)",
          { leadId },
        )
      } else {
        console.info("[sheets export] יוצאו משתתפים", {
          leadId,
          exported: exportRes.exported,
        })
      }
    }
  }

  // בדיקת השלמה אוטומטית (תשלום + תעודות)
  await tryAutoCompleteTrainingIfReady(leadId);

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

/** שכפול הדרכה/ליד — עותק עם מזהה חדש (ללא משתתפים/מכירות/הוצאות) */
export async function duplicateLead(
  leadId: string,
): Promise<ActionResult<{ id: string }>> {
  const src = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!src) return { ok: false, error: "ליד לא נמצא" };

  const actor = await getActiveCrmUser();
  const baseName = src.fullName.trim() || "ללא שם";
  const fullName = / \(עותק\)$/.test(baseName)
    ? baseName
    : `${baseName} (עותק)`;

  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    googleCalendarEventId: _gcal,
    ...rest
  } = src;

  const clone = await prisma.lead.create({
    data: {
      ...rest,
      fullName,
      googleCalendarEventId: null,
      conflictBypassed: false,
      createdBy: actor,
      lastUpdatedBy: actor,
    },
  });

  await prisma.activityLog.create({
    data: {
      leadId: clone.id,
      performedBy: actor,
      previousStatus: null,
      newStatus: clone.courseStatus,
    },
  });

  const after = await prisma.lead.findUnique({
    where: { id: clone.id },
    select: {
      id: true,
      fullName: true,
      instructor: true,
      courseType: true,
      courseTypeOther: true,
      scheduledStart: true,
      paymentStatus: true,
    },
  });
  if (after) {
    await syncUnassignedInstructorTask(after);
    await syncUnpaidPaymentTask(after);
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true, data: { id: clone.id } };
}

/** החזרת סטטוס שלב אחד אחורה בציר הזמן הקבוע */
export async function rollbackLeadStatus(
  leadId: string,
): Promise<ActionResult<{ id: string; status: string }>> {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) return { ok: false, error: "ליד לא נמצא" };

  const ui = dbStatusToUi(existing.courseStatus);
  const prevUi = previousLeadStatus(ui);
  if (!prevUi) {
    return {
      ok: false,
      error: "לא ניתן להחזיר סטטוס אחורה ממצב זה",
      code: "rollback_unavailable",
    };
  }

  const nextDb = uiStatusToDb(prevUi);
  const actor = await getActiveCrmUser();

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      courseStatus: nextDb,
      lastUpdatedBy: actor,
    },
  });

  await prisma.activityLog.create({
    data: {
      leadId,
      performedBy: actor,
      previousStatus: existing.courseStatus,
      newStatus: nextDb,
    },
  });

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      fullName: true,
      instructor: true,
      courseType: true,
      courseTypeOther: true,
      scheduledStart: true,
      paymentStatus: true,
    },
  });
  if (after) {
    await syncUnassignedInstructorTask(after);
    await syncUnpaidPaymentTask(after);
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true, data: { id: leadId, status: nextDb } };
}

/** רישום תשלום מהיר להדרכה */
export async function recordLeadPayment(
  leadId: string,
  data: {
    paymentDate: string;
    paymentMethod: string;
    paymentReceivedBy: string;
    paymentReceiptIssued: boolean;
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) return { ok: false, error: "ההדרכה לא נמצאה" };
  if (!data.paymentDate?.trim()) {
    return { ok: false, error: "יש לבחור תאריך תשלום" };
  }
  if (!data.paymentMethod?.trim()) {
    return { ok: false, error: "יש לבחור אופן תשלום" };
  }
  if (!data.paymentReceivedBy?.trim()) {
    return { ok: false, error: "יש לבחור מי קיבל את הכסף" };
  }

  const actor = await getActiveCrmUser();
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      paymentStatus: PAID_PAYMENT_STATUS,
      paymentDate: jerusalemLocalToUtcDate(data.paymentDate.trim(), "12:00"),
      paymentMethod: data.paymentMethod.trim(),
      paymentReceivedBy: data.paymentReceivedBy.trim(),
      paymentReceiptIssued: Boolean(data.paymentReceiptIssued),
      lastUpdatedBy: actor,
    },
  });

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      fullName: true,
      paymentStatus: true,
      scheduledStart: true,
    },
  });
  if (after) await syncUnpaidPaymentTask(after);

  await tryAutoCompleteTrainingIfReady(leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true, data: { id: leadId } };
}

async function upsertTraineeFromParticipant(data: {
  fullName: string;
  idNumber: string;
  email?: string | null;
  phone?: string | null;
}) {
  const fullName = data.fullName.trim() || "ללא שם";
  let idNumber = data.idNumber.trim().replace(/[-\s]/g, "");
  // ת״ז ריקה — מזהה זמני ייחודי (אילוץ @@unique על Trainee)
  if (!idNumber) {
    idNumber = `temp-${randomUUID()}`;
  }
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

/** הוספת משתתף פנימית — מספיק שדה אחד (שם / ת״ז / טלפון / אימייל) */
export async function addParticipant(
  leadId: string,
  fullName: string,
  idNumber: string,
  extras?: { phone?: string | null; email?: string | null },
) {
  const name = fullName.trim();
  const id = idNumber.trim().replace(/[-\s]/g, "");
  const phone = extras?.phone?.trim() || "";
  const email = extras?.email?.trim() || "";
  if (!name && !id && !phone && !email) {
    return {
      ok: false as const,
      error: "יש למלא לפחות שדה אחד (שם, ת״ז, טלפון או אימייל)",
    };
  }
  // מודרך גלובלי נוצר רק לאחר אישור נוכחות
  await prisma.participant.create({
    data: {
      leadId,
      fullName: name,
      idNumber: id,
      phone: phone || null,
      email: email || null,
    },
  });
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  let status = lead?.courseStatus;
  if (status === "completed") {
    await prisma.lead.update({
      where: { id: leadId },
      data: { courseStatus: "certificates_pending" },
    });
    status = "certificates_pending";
  }
  revalidatePath(`/leads/${leadId}`);

  if (status === "certificates_pending" && isGoogleSheetsConfigured()) {
    await exportLeadParticipantsToSheets(leadId);
  }

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
    hasLmsAccess: Boolean(p.hasLmsAccess),
    traineeId: p.traineeId || undefined,
    certificateUrl: p.certificateUrl || undefined,
  }));
}

export async function updateTrainee(
  id: string,
  data: {
    fullName?: string;
    idNumber?: string;
    phone?: string | null;
    email?: string | null;
    /** נחסם — מתעדכן רק מסנכרון Google Sheets */
    certificateEmailSent?: boolean;
    certificateCardPrinted?: boolean;
    notes?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.trainee.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "המודרך לא נמצא" };

  if (
    data.certificateEmailSent !== undefined ||
    data.certificateCardPrinted !== undefined
  ) {
    return {
      ok: false,
      error:
        "סימון תעודה במייל / כרטיס מודפס מתעדכן אוטומטית מ-Google Sheets בלבד",
      code: "sheets_readonly",
    };
  }

  const nextIdNumber =
    data.idNumber !== undefined
      ? data.idNumber.trim().replace(/[-\s]/g, "") || existing.idNumber
      : existing.idNumber;
  const nextFullName =
    data.fullName !== undefined
      ? data.fullName.trim() || existing.fullName || "ללא שם"
      : existing.fullName;

  if (nextIdNumber !== existing.idNumber) {
    const clash = await prisma.trainee.findUnique({
      where: { idNumber: nextIdNumber },
    });
    if (clash && clash.id !== id) {
      return { ok: false, error: "קיים כבר מודרך עם ת״ז זו" };
    }
  }

  const nextPhone =
    data.phone === undefined
      ? existing.phone
      : data.phone?.trim() || null;
  const nextEmail =
    data.email === undefined
      ? existing.email
      : data.email?.trim() || null;

  // עדכון מקור המודרך + סנכרון לכל רשומות המשתתף המשויכות
  await prisma.$transaction([
    prisma.trainee.update({
      where: { id },
      data: {
        fullName: nextFullName,
        idNumber: nextIdNumber,
        phone: nextPhone,
        email: nextEmail,
        notes:
          data.notes === undefined ? undefined : data.notes.trim() || null,
      },
    }),
    prisma.participant.updateMany({
      where: { traineeId: id },
      data: {
        fullName: nextFullName,
        idNumber: nextIdNumber,
        phone: nextPhone,
        email: nextEmail,
      },
    }),
  ]);

  const linked = await prisma.participant.findMany({
    where: { traineeId: id },
    select: { leadId: true },
  });
  for (const p of linked) {
    revalidatePath(`/leads/${p.leadId}`);
  }
  revalidatePath("/clients");
  revalidatePath("/leads");
  return { ok: true, data: { id } };
}

/** סנכרון ידני של דגלי תעודות מ-Google Sheets → CRM */
export async function syncCertificatesFromSheetsAction(): Promise<
  ActionResult<{ updated: number; autoCompleted: number }>
> {
  const res = await syncCertificateFlagsFromSheets();
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/clients");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return {
    ok: true,
    data: { updated: res.updated, autoCompleted: res.autoCompleted },
  };
}

/** ייצוא ידני של משתתפי הדרכה ל-Google Sheets */
export async function exportLeadCertificatesToSheetsAction(
  leadId: string,
): Promise<ActionResult<{ exported: number }>> {
  const res = await exportLeadParticipantsToSheets(leadId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return { ok: true, data: { exported: res.exported } };
}

/**
 * הפעלת הנפקת תעודות מרחוק דרך Google Apps Script Web App.
 * מאמת PIN בשרת, מוודא ייצוא לגיליון, ושולח webhook.
 * leadId אופציונלי — אם חסר, מזוהה לפי רשומות המשתתפים שנבחרו.
 */
export async function triggerRemoteCertificates(input: {
  leadId?: string;
  participantIds: string[];
  templateType: string;
  pin: string;
}): Promise<ActionResult<{ message: string; dispatched: number }>> {
  const pin = String(input.pin || "").trim();
  const expected = (
    process.env.CERTIFICATE_ISSUANCE_PIN?.trim() ||
    "214215444"
  ).trim();
  if (!pin || pin !== expected) {
    return { ok: false, error: "קוד אבטחה שגוי", code: "invalid_pin" };
  }

  const ids = [
    ...new Set(
      (input.participantIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) {
    return { ok: false, error: "יש לבחור לפחות משתתף אחד" };
  }

  const templateType = String(input.templateType || "REGULAR").toUpperCase();
  if (!["REGULAR", "REFRESH", "SKIPPERS"].includes(templateType)) {
    return { ok: false, error: "סוג תעודה לא תקין" };
  }

  const leadIdFilter = String(input.leadId || "").trim() || undefined;

  // משתתפי הדרכה (participant.id) ו/או מודרכים ללא שיוך (trainee.id)
  const ownedParticipants = await prisma.participant.findMany({
    where: {
      id: { in: ids },
      ...(leadIdFilter ? { leadId: leadIdFilter } : {}),
    },
    select: { id: true, leadId: true },
  });
  const foundParticipantIds = new Set(ownedParticipants.map((p) => p.id));
  const remainingIds = ids.filter((id) => !foundParticipantIds.has(id));

  const ownedTrainees =
    remainingIds.length && !leadIdFilter
      ? await prisma.trainee.findMany({
          where: { id: { in: remainingIds } },
          select: { id: true },
        })
      : [];

  const webhookIds = [
    ...ownedParticipants.map((p) => p.id),
    ...ownedTrainees.map((t) => t.id),
  ];
  if (!webhookIds.length) {
    return {
      ok: false,
      error: leadIdFilter
        ? "לא נמצאו משתתפים תואמים בהדרכה זו"
        : "לא נמצאו מודרכים/משתתפים תואמים לבחירה",
    };
  }

  // ייצוא חסרים לגיליון לפני ההנפקה
  if (isGoogleSheetsConfigured()) {
    const leadIds = [...new Set(ownedParticipants.map((p) => p.leadId))];
    for (const lid of leadIds) {
      const exportRes = await exportLeadParticipantsToSheets(lid);
      if (!exportRes.ok) {
        console.error("[triggerRemoteCertificates] export", exportRes.error);
        return {
          ok: false,
          error: `לא ניתן לייצא לגיליון לפני הנפקה: ${exportRes.error}`,
        };
      }
    }
    if (ownedTrainees.length) {
      const exportRes = await exportTraineesToCertificateSheet(
        ownedTrainees.map((t) => t.id),
      );
      if (!exportRes.ok) {
        console.error(
          "[triggerRemoteCertificates] trainee export",
          exportRes.error,
        );
        return {
          ok: false,
          error: `לא ניתן לייצא מודרכים לגיליון לפני הנפקה: ${exportRes.error}`,
        };
      }
    }
  }

  const webhookUrl =
    process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL?.trim();
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "חסר כתובת Webhook של Google Apps Script (GOOGLE_APPS_SCRIPT_WEBHOOK_URL)",
      code: "webhook_missing",
    };
  }

  const payload = {
    action: "generateCertificates",
    templateType,
    participantIds: webhookIds,
    authPin: pin,
    pin,
    leadId: leadIdFilter || ownedParticipants[0]?.leadId || null,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const text = await res.text();
    let scriptMessage = "";
    try {
      const json = JSON.parse(text) as {
        ok?: boolean;
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (json.error) {
        return { ok: false, error: json.error };
      }
      scriptMessage = json.message || "";
      if (json.ok === false || json.success === false) {
        return {
          ok: false,
          error: scriptMessage || "הסקריפט ב-Sheets החזיר כישלון",
        };
      }
    } catch {
      // Apps Script לעיתים מחזיר טקסט פשוט
      if (!res.ok) {
        return {
          ok: false,
          error: text || `שגיאת Webhook (${res.status})`,
        };
      }
      scriptMessage = text.trim();
    }

    if (!res.ok) {
      return {
        ok: false,
        error: scriptMessage || `שגיאת Webhook (${res.status})`,
      };
    }

    return {
      ok: true,
      data: {
        dispatched: webhookIds.length,
        message:
          scriptMessage ||
          `הבקשה נשלחה ל-Google Sheets! התעודות מופקות ונשלחות במייל ברקע (${webhookIds.length}).`,
      },
    };
  } catch (err) {
    console.error("[triggerRemoteCertificates]", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאת רשת בשליחה ל-Google Apps Script",
    };
  }
}

/** מחיקה לצמיתות של מודרך + כל רשומות המשתתף בהדרכות המשויכות */
export async function deleteTrainee(
  id: string,
): Promise<ActionResult<{ id: string; deletedParticipants: number }>> {
  const existing = await prisma.trainee.findUnique({
    where: { id },
  });
  if (!existing) return { ok: false, error: "המודרך לא נמצא" };

  const leadIds = [
    ...new Set(
      (
        await prisma.participant.findMany({
          where: {
            OR: [{ traineeId: id }, { idNumber: existing.idNumber }],
          },
          select: { leadId: true },
        })
      ).map((p) => p.leadId),
    ),
  ];

  const deleted = await prisma.$transaction(async (tx) => {
    const removed = await tx.participant.deleteMany({
      where: {
        OR: [{ traineeId: id }, { idNumber: existing.idNumber }],
      },
    });
    await tx.trainee.delete({ where: { id } });
    return removed.count;
  });

  for (const leadId of leadIds) {
    revalidatePath(`/leads/${leadId}`);
  }
  revalidatePath("/clients");
  revalidatePath("/leads");
  return {
    ok: true,
    data: { id, deletedParticipants: deleted },
  };
}

export type TraineeImportPayloadRow = {
  fullName: string;
  idNumber: string;
  phone?: string;
  email?: string;
  organizerName?: string;
  trainingDate?: string;
  courseType?: string;
  satisfaction?: string;
  feedback?: string;
  interestedInFirstAidKit?: string;
  /** Explicit lead; otherwise try match by organizerName */
  leadId?: string;
  notes?: string;
};

const ASSIGNABLE_DB_STATUSES = ["closed", "certificates_pending"] as const;

function normalizeMatch(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function findAssignableLeadId(opts: {
  leadId?: string;
  organizerName?: string;
  trainingDate?: string;
}): Promise<string | null> {
  if (opts.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: opts.leadId } });
    if (
      lead &&
      (ASSIGNABLE_DB_STATUSES as readonly string[]).includes(lead.courseStatus)
    ) {
      return lead.id;
    }
    return null;
  }

  const organizer = opts.organizerName?.trim();
  if (!organizer) return null;

  const candidates = await prisma.lead.findMany({
    where: { courseStatus: { in: [...ASSIGNABLE_DB_STATUSES] } },
    select: {
      id: true,
      fullName: true,
      scheduledStart: true,
    },
  });

  const target = normalizeMatch(organizer);
  const byName = candidates.filter(
    (l) =>
      normalizeMatch(l.fullName) === target ||
      normalizeMatch(l.fullName).includes(target) ||
      target.includes(normalizeMatch(l.fullName)),
  );

  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1 && opts.trainingDate) {
    const day = opts.trainingDate.trim().slice(0, 10);
    const dated = byName.find((l) => {
      if (!l.scheduledStart) return false;
      const iso = l.scheduledStart.toISOString().slice(0, 10);
      return iso === day;
    });
    if (dated) return dated.id;
  }
  return byName[0]?.id ?? null;
}

/** יצירת מודרך ידנית (+ שיוך להדרכה אופציונלי) — שדות אופציונליים, מספיק שדה אחד */
export async function createTraineeManual(data: {
  fullName: string;
  idNumber: string;
  phone?: string;
  email?: string;
  notes?: string;
  leadId?: string;
}): Promise<ActionResult<{ traineeId: string; participantId?: string }>> {
  const fullName = data.fullName.trim();
  const idNumberRaw = data.idNumber.trim().replace(/[-\s]/g, "");
  const phone = data.phone?.trim() || "";
  const email = data.email?.trim() || "";

  if (!fullName && !idNumberRaw && !phone && !email) {
    return {
      ok: false,
      error: "יש למלא לפחות שדה אחד (שם, ת״ז, טלפון או אימייל)",
    };
  }

  const trainee = await upsertTraineeFromParticipant({
    fullName: fullName || (phone ? phone : "ללא שם"),
    idNumber: idNumberRaw,
    phone: phone || undefined,
    email: email || undefined,
  });

  if (data.notes?.trim()) {
    await prisma.trainee.update({
      where: { id: trainee.id },
      data: { notes: data.notes.trim() },
    });
  }

  let participantId: string | undefined;
  if (data.leadId) {
    const leadId = await findAssignableLeadId({ leadId: data.leadId });
    if (!leadId) {
      return {
        ok: false,
        error: "ההדרכה שנבחרה אינה זמינה לשיוך (נדרש סטטוס סגור/ממתין לתעודות)",
      };
    }

    const idNumber = trainee.idNumber;
    const existing = idNumberRaw
      ? await prisma.participant.findFirst({
          where: { leadId, idNumber: idNumberRaw },
        })
      : null;
    if (existing) {
      await prisma.participant.update({
        where: { id: existing.id },
        data: {
          traineeId: trainee.id,
          fullName: trainee.fullName,
          phone: phone || existing.phone,
          email: email || existing.email,
          attended: true,
        },
      });
      participantId = existing.id;
    } else {
      const created = await prisma.participant.create({
        data: {
          leadId,
          traineeId: trainee.id,
          fullName: trainee.fullName,
          idNumber,
          phone: phone || null,
          email: email || null,
          attended: true,
        },
      });
      participantId = created.id;
    }
    revalidatePath(`/leads/${leadId}`);
  }

  revalidatePath("/clients");
  revalidatePath("/leads");
  return { ok: true, data: { traineeId: trainee.id, participantId } };
}

/** ייבוא מרובה מאקסל — יוצר/מעדכן מודרכים ומשייך להדרכות כשאפשר */
export async function bulkImportTrainees(
  rows: TraineeImportPayloadRow[],
  defaultLeadId?: string,
): Promise<
  ActionResult<{
    created: number;
    updated: number;
    linked: number;
    skipped: number;
    errors: string[];
  }>
> {
  if (!rows.length) return { ok: false, error: "אין שורות לייבוא" };

  let created = 0;
  let updated = 0;
  let linked = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fullName = row.fullName?.trim() || "";
    const idNumber = (row.idNumber || "").trim().replace(/[-\s]/g, "");
    if (!fullName || !idNumber) {
      skipped += 1;
      errors.push(`שורה ${i + 1}: חסר שם או ת״ז`);
      continue;
    }

    try {
      const existing = await prisma.trainee.findUnique({ where: { idNumber } });
      const trainee = await upsertTraineeFromParticipant({
        fullName,
        idNumber,
        phone: row.phone,
        email: row.email,
      });
      if (existing) updated += 1;
      else created += 1;

      if (row.feedback?.trim() || row.notes?.trim()) {
        const noteParts = [
          existing?.notes,
          row.notes?.trim(),
          row.feedback?.trim()
            ? `משוב: ${row.feedback.trim()}`
            : undefined,
        ].filter(Boolean);
        if (noteParts.length) {
          await prisma.trainee.update({
            where: { id: trainee.id },
            data: { notes: noteParts.join("\n") },
          });
        }
      }

      const leadId = await findAssignableLeadId({
        leadId: row.leadId || defaultLeadId,
        organizerName: row.organizerName,
        trainingDate: row.trainingDate,
      });

      if (leadId) {
        const kit =
          row.interestedInFirstAidKit?.trim() || null;
        const dup = await prisma.participant.findFirst({
          where: { leadId, idNumber },
        });
        if (dup) {
          await prisma.participant.update({
            where: { id: dup.id },
            data: {
              traineeId: trainee.id,
              fullName,
              phone: row.phone?.trim() || dup.phone,
              email: row.email?.trim() || dup.email,
              organizerName:
                row.organizerName?.trim() || dup.organizerName,
              courseDate: row.trainingDate?.trim() || dup.courseDate,
              satisfaction:
                row.satisfaction?.trim() || dup.satisfaction,
              feedback: row.feedback?.trim() || dup.feedback,
              kitInterest: kit || dup.kitInterest,
              attended: true,
            },
          });
        } else {
          await prisma.participant.create({
            data: {
              leadId,
              traineeId: trainee.id,
              fullName,
              idNumber,
              phone: row.phone?.trim() || null,
              email: row.email?.trim() || null,
              organizerName: row.organizerName?.trim() || null,
              courseDate: row.trainingDate?.trim() || null,
              satisfaction: row.satisfaction?.trim() || null,
              feedback: row.feedback?.trim() || null,
              kitInterest: kit,
              attended: true,
            },
          });
        }
        linked += 1;
        revalidatePath(`/leads/${leadId}`);
      }
    } catch (e) {
      skipped += 1;
      errors.push(
        `שורה ${i + 1} (${fullName}): ${e instanceof Error ? e.message : "שגיאה"}`,
      );
    }
  }

  revalidatePath("/clients");
  revalidatePath("/leads");
  return {
    ok: true,
    data: { created, updated, linked, skipped, errors },
  };
}

/** שיוך מודרכים קיימים להדרכה */
export async function assignTraineesToLead(
  traineeIds: string[],
  leadId: string,
): Promise<ActionResult<{ linked: number; skipped: number }>> {
  if (!traineeIds.length) return { ok: false, error: "לא נבחרו מודרכים" };

  const resolved = await findAssignableLeadId({ leadId });
  if (!resolved) {
    return {
      ok: false,
      error: "ההדרכה אינה זמינה לשיוך (נדרש סטטוס סגור/ממתין לתעודות)",
    };
  }

  const trainees = await prisma.trainee.findMany({
    where: { id: { in: traineeIds } },
  });

  let linked = 0;
  let skipped = 0;

  for (const t of trainees) {
    const existing = await prisma.participant.findFirst({
      where: { leadId: resolved, idNumber: t.idNumber },
    });
    if (existing) {
      if (existing.traineeId !== t.id) {
        await prisma.participant.update({
          where: { id: existing.id },
          data: { traineeId: t.id, attended: true },
        });
        linked += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    await prisma.participant.create({
      data: {
        leadId: resolved,
        traineeId: t.id,
        fullName: t.fullName,
        idNumber: t.idNumber,
        phone: t.phone,
        email: t.email,
        attended: true,
      },
    });
    linked += 1;
  }

  revalidatePath(`/leads/${resolved}`);
  revalidatePath("/clients");
  revalidatePath("/leads");
  return { ok: true, data: { linked, skipped } };
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
  totalPurchased?: number;
  isComposite?: boolean;
  components?: { childId: string; quantity: number }[];
}): Promise<ActionResult<{ id: string }>> {
  if (!data.name.trim()) return { ok: false, error: "שם פריט הוא שדה חובה" };

  const isComposite = Boolean(data.isComposite);
  const base = {
    name: data.name.trim(),
    category: data.category?.trim() || null,
    sellingPrice: Number(data.sellingPrice) || 0,
    costPrice: Number(data.costPrice) || 0,
    supplierName: data.supplierName?.trim() || null,
    totalPurchased: isComposite
      ? 0
      : Math.max(0, Number(data.totalPurchased) || 0),
    isComposite,
  };

  let id = data.id;
  if (id) {
    await prisma.inventoryItem.update({ where: { id }, data: base });
  } else {
    const created = await prisma.inventoryItem.create({
      data: { ...base, totalSold: 0 },
    });
    id = created.id;
  }

  if (isComposite && data.components) {
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
  } else if (!isComposite) {
    await prisma.inventoryComponent.deleteMany({ where: { parentId: id } });
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

/** עדכון totalSold לרכיבים / פריט בודד (ללא חסימת מלאי שלילי במכירה) */
async function applyInventorySaleDelta(
  inventoryItemId: string,
  soldQty: number,
  direction: 1 | -1,
) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: { components: true },
  });
  if (!item) return;

  const bumpSold = async (id: string, current: number, bump: number) => {
    const next = Math.max(0, (Number(current) || 0) + bump);
    await prisma.inventoryItem.update({
      where: { id },
      data: { totalSold: next },
    });
  };

  if (item.isComposite) {
    // תיק מורכב — לא מעדכנים totalSold של התיק עצמו
    for (const c of item.components) {
      const bump = (Number(c.quantity) || 0) * soldQty * direction;
      if (!bump) continue;
      const child = await prisma.inventoryItem.findUnique({
        where: { id: c.childId },
        select: { totalSold: true },
      });
      if (!child) continue;
      await bumpSold(c.childId, child.totalSold, bump);
    }
    return;
  }

  await bumpSold(inventoryItemId, item.totalSold, soldQty * direction);
}

export async function addTrainingSale(
  leadId: string | null,
  inventoryItemId: string,
  quantity: number,
  unitSellingPrice?: number,
  opts?: {
    paymentMethod?: string | null
    unpaid?: boolean
  },
): Promise<ActionResult<{ id: string }>> {
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));
  if (!qty) return { ok: false, error: "כמות חייבת להיות לפחות 1" };

  const unpaid = Boolean(opts?.unpaid);
  const paymentMethod = opts?.paymentMethod?.trim() || null;
  if (!unpaid && !paymentMethod) {
    return { ok: false, error: "יש לבחור איך שולם" };
  }
  if (
    unitSellingPrice == null ||
    Number.isNaN(Number(unitSellingPrice)) ||
    Number(unitSellingPrice) < 0
  ) {
    return { ok: false, error: "יש להזין סכום / עלות" };
  }

  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
  });
  if (!item) return { ok: false, error: "הפריט לא נמצא במלאי" };

  const unitCost =
    Number(item.costPrice) || Number(item.sellingPrice) || 0;
  const unitSell = Number(unitSellingPrice);

  // זכירת מחיר מכירה אחרון על הפריט (גם לתיקים — ללא ניכוי מלאי מהתיק)
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
      paymentMethod: unpaid ? null : paymentMethod,
      paymentStatus: unpaid
        ? TRAINING_SALE_PENDING_PAYMENT
        : TRAINING_SALE_PAID,
    },
  });

  // ניכוי מלאי: פריט בודד → +totalSold; תיק → +totalSold לרכיבים
  await applyInventorySaleDelta(inventoryItemId, qty, 1);

  if (unpaid && leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        fullName: true,
        courseType: true,
        courseTypeOther: true,
      },
    });
    const productName = item.name?.trim() || "פריט";
    const totalAmount = unitSell * qty;
    const trainingName = formatCourseTypeLabel(lead?.courseType, {
      other: lead?.courseTypeOther,
    });
    const clientName = lead?.fullName?.trim() || "";

    await prisma.followUpTask.create({
      data: {
        leadId,
        title: unpaidTrainingSaleTaskTitle(productName, totalAmount),
        assignee: "מכירות",
        notes: unpaidTrainingSaleTaskNotes({
          productName,
          totalAmount,
          trainingName,
          clientName,
        }),
      },
    });
    revalidatePath("/calendar");
  }

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
  const existing = await prisma.trainingSale.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "המכירה לא נמצאה" };

  await applyInventorySaleDelta(
    existing.inventoryItemId,
    existing.quantity,
    -1,
  );
  await prisma.trainingSale.delete({ where: { id } });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/equipment");
  revalidatePath("/");
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

/** @deprecated יצירת LMS היא ברמת מודרך — השתמשו ב־/api/lms/create-user */
export async function createLmsUser(
  _leadId: string,
): Promise<
  ActionResult<{ username: string; password: string; loginUrl: string; message: string }>
> {
  return {
    ok: false,
    error:
      "יצירת משתמש LMS מתבצעת עבור מודרכים בטאב המשתתפים — לא עבור איש הקשר של הליד",
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

/** גיבוי מלא של כל מכירות הציוד ל-Google Sheets (Apps Script) */
export async function backupSalesToSheets(): Promise<
  ActionResult<{ count: number; message: string }>
> {
  try {
    const {
      buildSalesBackupPayload,
      postSalesBackupToSheets,
    } = await import("@/lib/google-sheets/sales-backup");

    const sales = await buildSalesBackupPayload();
    if (!sales.length) {
      return { ok: false, error: "אין מכירות לגיבוי" };
    }

    const result = await postSalesBackupToSheets(sales);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      data: {
        count: sales.length,
        message: result.message || "גיבוי המכירות הושלם בהצלחה!",
      },
    };
  } catch (err) {
    console.error("[backupSalesToSheets]", err);
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "שגיאה בגיבוי המכירות ל-Google Sheets",
    };
  }
}

/**
 * יצירת גישת LMS דרך Google Sheets (Apps Script → טאב LMS-CRM).
 * שם משתמש וסיסמה = ת״ז; דוא״ל ות״ז חובה.
 */
export async function sendLmsAccessToSheets(
  participantIds: string[],
): Promise<
  ActionResult<{ count: number; participantIds: string[]; message: string }>
> {
  try {
    const {
      loadLmsAccessParticipants,
      postLmsAccessToSheets,
    } = await import("@/lib/google-sheets/lms-access");

    const loaded = await loadLmsAccessParticipants(participantIds);
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }

    const posted = await postLmsAccessToSheets(loaded.participants);
    if (!posted.ok) {
      return { ok: false, error: posted.error };
    }

    const okIds = loaded.participants.map((p) => p.participantId);
    await prisma.participant.updateMany({
      where: { id: { in: okIds } },
      data: { hasLmsAccess: true },
    });

    for (const leadId of loaded.leadIds) {
      revalidatePath(`/leads/${leadId}`);
    }
    revalidatePath("/leads");
    revalidatePath("/");

    return {
      ok: true,
      data: {
        count: okIds.length,
        participantIds: okIds,
        message:
          posted.message ||
          "פרטי הגישה למערכת הלמידה נשלחו בהצלחה!",
      },
    };
  } catch (err) {
    console.error("[sendLmsAccessToSheets]", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בשליחת פרטי LMS ל-Google Sheets",
    };
  }
}
