"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { sanitizePhone } from "@/lib/utils";
import { syncGoogleCalendar, validateStatusTransition } from "@/lib/conflicts";
import type { ConflictHit } from "@/lib/conflicts";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; conflicts?: ConflictHit[] };

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

export async function createLead(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = sanitizePhone(String(formData.get("phone") ?? ""));
  if (!fullName || !phone) {
    return { ok: false, error: "שם מלא וטלפון הם שדות חובה" };
  }

  const lead = await prisma.lead.create({
    data: {
      fullName,
      phone,
      email: String(formData.get("email") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      leadSource: String(formData.get("leadSource") ?? "") || null,
      urgency: String(formData.get("urgency") ?? "normal"),
      activityType: String(formData.get("activityType") ?? "course"),
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

  // Coerce numeric / date fields
  if (raw.scheduledStart != null && raw.scheduledStart !== "") {
    merged.scheduledStart = new Date(String(raw.scheduledStart));
  }
  if (raw.scheduledEnd != null && raw.scheduledEnd !== "") {
    merged.scheduledEnd = new Date(String(raw.scheduledEnd));
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
  if (raw.agreedPrice != null && raw.agreedPrice !== "") {
    merged.agreedPrice = Number(raw.agreedPrice);
  }
  if (raw.kindergartenApproved != null) {
    merged.kindergartenApproved = Boolean(raw.kindergartenApproved);
  }
  if (raw.bookletRequired != null) {
    merged.bookletRequired = Boolean(raw.bookletRequired);
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

  const agreedPrice = calcAgreedPrice({
    pricingModel: merged.pricingModel,
    perParticipantRate: merged.perParticipantRate,
    expectedParticipants: merged.expectedParticipants,
    agreedPrice: merged.agreedPrice,
  });

  let quoteSentAt = existing.quoteSentAt;
  if (merged.quoteStatus === "sent" && existing.quoteStatus !== "sent") {
    quoteSentAt = new Date();
  }

  let googleCalendarEventId = existing.googleCalendarEventId;
  if (nextStatus === "closed" && existing.courseStatus !== "closed") {
    googleCalendarEventId = await syncGoogleCalendar(merged);
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      fullName: String(merged.fullName),
      phone,
      email: merged.email,
      city: merged.city,
      leadSource: merged.leadSource,
      urgency: merged.urgency ?? "normal",
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
      pricingModel: merged.pricingModel ?? "flat_rate",
      perParticipantRate: merged.perParticipantRate,
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
      googleCalendarEventId,
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
  revalidatePath("/dashboard");
  return { ok: true, data: { id: leadId } };
}

export async function addParticipant(leadId: string, fullName: string, idNumber: string) {
  if (!fullName.trim() || !idNumber.trim()) {
    return { ok: false as const, error: "שם מלא ות.ז. הם שדות חובה" };
  }
  await prisma.participant.create({
    data: { leadId, fullName: fullName.trim(), idNumber: idNumber.trim() },
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
