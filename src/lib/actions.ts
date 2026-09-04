"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { getActiveCrmUser } from "@/lib/crm-user-server";
import {
  formatCourseTypeLabel,
  resolveCourseTypeForSave,
  resolveParticipantCertificateCourseType,
  isRefreshCourseType,
  certificateScopeForSheet,
  isKindergartenRefreshCourseType,
  hasCompleteKindergartenRefreshDetails,
  yossiAmarDetailsTaskTitle,
  YOSSI_AMAR_DETAILS_TASK_PREFIX,
} from "@/lib/course-type";
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
  unpaidPaymentTaskTitle,
  parseSessionsJson,
  type TrainingSessionSlot,
} from "@/lib/payment";
import { isTrainingFullySettled } from "@/lib/training-profit";
import { syncReceiptExpenseForLead } from "@/lib/receipt-expense-sync";
import {
  buildEquipmentDealTransaction,
  buildParticipantTransaction,
  buildSaleTransaction,
  buildTrainingBaseTransaction,
  isLeadEligibleForPaymentLedger,
  PAYMENT_LEDGER_ELIGIBLE_COURSE_STATUSES,
  sortPaymentTransactions,
  type PaymentTransaction,
} from "@/lib/payment-transactions";
import { sanitizePhone } from "@/lib/utils";
import { validateStatusTransition } from "@/lib/conflicts";
import type { ConflictHit } from "@/lib/conflicts";
import {
  exportLeadParticipantsToSheets,
  exportMissingAttendedToSheets,
  syncParticipantAttendanceToSheets,
  syncCertificateFlagsFromSheets,
  syncCertificateStatusesToSheets,
  syncCertificateHoursForParticipantIds,
  syncCertificateUrlsForParticipantIds,
  tryAutoCompleteTrainingIfReady,
  exportTraineesToCertificateSheet,
} from "@/lib/google-sheets/certificates";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets/client";
import { refreshParticipantsFromWix } from "@/lib/google-sheets/wix-sync";
import {
  dbStatusToUi,
  previousLeadStatus,
  uiStatusToDb,
} from "@/lib/types";
import { ASSIGNABLE_LEAD_DB_STATUSES } from "@/lib/trainee-import";
import {
  normalizeCertifyingBody,
  resolveParticipantCertifyingBodyOnCreate,
} from "@/lib/certifying-body";
import {
  findParticipantByIdNumber,
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity";
import {
  findParticipantOnLeadByIdNumber,
  upsertParticipantOnLead,
} from "@/lib/participant-upsert";
import {
  linkParticipantToTrainee,
  syncParticipantContactToTrainee,
  upsertTraineeFromParticipant,
} from "@/lib/trainee-directory";

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

/** משימה אוטומטית כשאין מדריך משובץ — רק בסטטוס closed (נרשם ביומן); סוגרת כששובץ / לא ביומן */
async function syncUnassignedInstructorTask(lead: {
  id: string;
  fullName: string;
  instructor: string | null;
  courseType: string | null;
  courseTypeOther: string | null;
  scheduledStart: Date | null;
  courseStatus?: string | null;
}) {
  const courseLabel = formatCourseTypeLabel(lead.courseType || "", {
    other: lead.courseTypeOther,
  });
  const title = assignInstructorTaskTitle(lead.fullName, courseLabel);
  const registeredInCalendar = lead.courseStatus === "closed";

  if (isInstructorUnassigned(lead.instructor) && registeredInCalendar) {
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

/**
 * משימה אוטומטית לרענון מעון + התנהלות בטוחה —
 * נוצרת כשסוג הקורס נבחר; נסגרת כשכל פרטי המעון מולאו או כשסוג הקורס משתנה.
 */
async function syncYossiAmarDetailsTask(lead: {
  id: string;
  fullName: string;
  courseType: string | null;
  courseTypeOther: string | null;
  scheduledStart: Date | null;
  kindergartenManagerName?: string | null;
  kindergartenManagerPhone?: string | null;
  institutionSymbol?: string | null;
  basicTrainingDate?: string | null;
}) {
  const isRefresh = isKindergartenRefreshCourseType(
    lead.courseType,
    lead.courseTypeOther,
  );
  const title = yossiAmarDetailsTaskTitle(lead.fullName);

  if (isRefresh && !hasCompleteKindergartenRefreshDetails(lead)) {
    let dueDate: Date | null = null;
    if (lead.scheduledStart) {
      const { date } = formatInJerusalem(lead.scheduledStart);
      if (date) dueDate = jerusalemLocalToUtcDate(date, "09:00");
    }

    const existing = await prisma.followUpTask.findFirst({
      where: {
        leadId: lead.id,
        completed: false,
        title: { startsWith: YOSSI_AMAR_DETAILS_TASK_PREFIX },
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
          notes:
            "נוצר אוטומטית — יש להשלים פרטי מעון (מנהלת, טלפון, סמל, תאריך בסיס) ולשלוח ליוסי עמר מפעולות מהירות",
        },
      });
    }
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    return;
  }

  await prisma.followUpTask.updateMany({
    where: {
      leadId: lead.id,
      completed: false,
      title: { startsWith: YOSSI_AMAR_DETAILS_TASK_PREFIX },
    },
    data: { completed: true },
  });
}

/** משימת גבייה אוטומטית כל עוד יתרת ההדרכה אינה מכוסה */
async function syncUnpaidPaymentTask(lead: {
  id: string;
  fullName: string;
  paymentStatus: string | null;
  scheduledStart: Date | null;
  agreedPrice?: number | null;
}) {
  const title = unpaidPaymentTaskTitle(lead.fullName);
  const participants = await prisma.participant.findMany({
    where: { leadId: lead.id },
    select: {
      id: true,
      fullName: true,
      isExternal: true,
      isLead: true,
      agreedPrice: true,
      paymentStatus: true,
    },
  });
  const trainingSales = await prisma.trainingSale.findMany({
    where: { leadId: lead.id },
    select: {
      id: true,
      quantity: true,
      unitSellingPrice: true,
      paymentStatus: true,
      createdAt: true,
      inventoryItem: { select: { name: true } },
    },
  });
  const settled = isTrainingFullySettled({
    totalPrice: Number(lead.agreedPrice) || 0,
    paymentStatus: lead.paymentStatus || undefined,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.fullName,
      idNumber: "",
      isExternal: Boolean(p.isExternal),
      isLead: Boolean(p.isLead),
      agreedPrice: p.agreedPrice != null ? Number(p.agreedPrice) : undefined,
      paymentStatus: p.paymentStatus || undefined,
    })),
    trainingSales: trainingSales.map((s) => ({
      id: s.id,
      inventoryItemId: "",
      itemName: s.inventoryItem?.name || "מכירת ציוד",
      quantity: s.quantity,
      unitSellingPrice: Number(s.unitSellingPrice) || 0,
      unitCostPrice: 0,
      paymentStatus: s.paymentStatus || undefined,
      createdAt: s.createdAt?.toISOString?.() ?? new Date().toISOString(),
    })),
  });

  if (!settled) {
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

/** אזהרה בלבד — לא חוסם יצירת ליד חדש לאותו טלפון */
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

async function replaceTrainingSessions(
  leadId: string,
  sessionsRaw: string | null | undefined,
  fallbackAddress?: {
    city?: string | null
    street?: string | null
    houseNumber?: string | null
  },
) {
  if (sessionsRaw === undefined) return
  const slots: TrainingSessionSlot[] = sessionsRaw
    ? parseSessionsJson(String(sessionsRaw))
    : []
  await prisma.trainingSession.deleteMany({ where: { leadId } })
  if (slots.length === 0) return
  await prisma.trainingSession.createMany({
    data: slots.map((s, i) => ({
      leadId,
      sortOrder: i,
      date: (s.date || "").trim(),
      startTime: (s.time || "").trim(),
      endTime: s.endTime?.trim() || null,
      isZoom: Boolean(s.isZoom),
      zoomLink: s.isZoom && s.zoomLink?.trim() ? s.zoomLink.trim() : null,
      city: s.city || (!s.isZoom ? fallbackAddress?.city : null) || null,
      street: s.street || (!s.isZoom ? fallbackAddress?.street : null) || null,
      houseNumber:
        s.houseNumber ||
        (!s.isZoom ? fallbackAddress?.houseNumber : null) ||
        null,
    })),
  })
}

/** שיוך ליד חדש ללקוח קיים לפי טלפון — בלי לחסום יצירה */
async function findExistingClientByPhone(phone: string): Promise<{
  accountId?: string
  contactId?: string
} | null> {
  if (!phone) return null

  const contact = await prisma.contact.findFirst({
    where: { phone },
    orderBy: { updatedAt: "desc" },
    select: { id: true, accountId: true },
  })
  if (contact) {
    return {
      accountId: contact.accountId || undefined,
      contactId: contact.id,
    }
  }

  const existingLead = await prisma.lead.findFirst({
    where: {
      phone,
      OR: [{ accountId: { not: null } }, { contactId: { not: null } }],
    },
    orderBy: { updatedAt: "desc" },
    select: { accountId: true, contactId: true },
  })
  if (!existingLead?.accountId && !existingLead?.contactId) return null
  return {
    accountId: existingLead.accountId || undefined,
    contactId: existingLead.contactId || undefined,
  }
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

  const existingClient = await findExistingClientByPhone(phone);
  const requestedSource = String(formData.get("leadSource") ?? "") || null;

  const actor = await getActiveCrmUser();
  const lead = await prisma.lead.create({
    data: {
      fullName,
      phone,
      email: String(formData.get("email") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      accountId: existingClient?.accountId,
      contactId: existingClient?.contactId,
      leadSource: existingClient?.accountId ? "returning" : requestedSource,
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

/** עדכון certifyingBody למשתתפים פנימיים כשמשתנה «תעודות דרך מי» ברמת ההדרכה */
async function cascadeLeadCertifyingBodyToInternalParticipants(
  leadId: string,
  deliveryMethod: string | null | undefined,
): Promise<void> {
  const body = deliveryMethod
    ? normalizeCertifyingBody(deliveryMethod) || deliveryMethod
    : null

  await prisma.participant.updateMany({
    where: { leadId, isExternal: false },
    data: { certifyingBody: body },
  })

  const linked = await prisma.participant.findMany({
    where: { leadId, isExternal: false, traineeId: { not: null } },
    select: { traineeId: true },
  })
  const traineeIds = [
    ...new Set(
      linked
        .map((p) => p.traineeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (traineeIds.length) {
    await prisma.trainee.updateMany({
      where: { id: { in: traineeIds } },
      data: { certifyingBody: body },
    })
  }
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
  if (raw.scheduledStart === null || raw.scheduledStart === "") {
    merged.scheduledStart = null;
  } else if (raw.scheduledStart != null) {
    merged.scheduledStart =
      parseIncomingDateTime(raw.scheduledStart) ?? existing.scheduledStart;
  }
  if (raw.scheduledEnd === null || raw.scheduledEnd === "") {
    merged.scheduledEnd = null;
  } else if (raw.scheduledEnd != null) {
    merged.scheduledEnd =
      parseIncomingDateTime(raw.scheduledEnd) ?? existing.scheduledEnd;
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

  // חסימת "הסתיים" כל עוד יתרת התשלום אינה מכוסה
  // (תשלום בסיס מפורש ו/או תשלומי משתתפים פנימיים שמקזזים את הבסיס + חיצוניים)
  if (
    nextStatus === "closed_won" &&
    existing.courseStatus !== "closed_won"
  ) {
    const participants = await prisma.participant.findMany({
      where: { leadId },
      select: {
        id: true,
        fullName: true,
        isExternal: true,
        isLead: true,
        agreedPrice: true,
        paymentStatus: true,
      },
    });
    const trainingSales = await prisma.trainingSale.findMany({
      where: { leadId },
      select: {
        id: true,
        quantity: true,
        unitSellingPrice: true,
        paymentStatus: true,
        createdAt: true,
        inventoryItem: { select: { name: true } },
      },
    });
    const agreed =
      merged.agreedPrice != null
        ? Number(merged.agreedPrice)
        : Number(existing.agreedPrice) || 0;
    const settled = isTrainingFullySettled({
      totalPrice: Number.isFinite(agreed) ? agreed : 0,
      paymentStatus:
        String(merged.paymentStatus ?? existing.paymentStatus ?? "") ||
        undefined,
      participants: participants.map((p) => ({
        id: p.id,
        name: p.fullName,
        idNumber: "",
        isExternal: Boolean(p.isExternal),
        isLead: Boolean(p.isLead),
        agreedPrice: p.agreedPrice != null ? Number(p.agreedPrice) : undefined,
        paymentStatus: p.paymentStatus || undefined,
      })),
      trainingSales: trainingSales.map((s) => ({
        id: s.id,
        inventoryItemId: "",
        itemName: s.inventoryItem?.name || "מכירת ציוד",
        quantity: s.quantity,
        unitSellingPrice: Number(s.unitSellingPrice) || 0,
        unitCostPrice: 0,
        paymentStatus: s.paymentStatus || undefined,
        createdAt: s.createdAt?.toISOString?.() ?? new Date().toISOString(),
      })),
    });
    if (!settled) {
      return {
        ok: false,
        error:
          "לא ניתן לסמן הדרכה כ״הסתיים״ לפני שיתרת התשלום מכוסה במלואה (תשלום בסיס, משתתפים ומכירות ציוד).",
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
      contactName:
        raw.contactName !== undefined
          ? raw.contactName
            ? String(raw.contactName).trim()
            : null
          : existing.contactName,
      contactNameSecondary:
        raw.contactNameSecondary !== undefined
          ? raw.contactNameSecondary
            ? String(raw.contactNameSecondary).trim()
            : null
          : existing.contactNameSecondary,
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
      kindergartenManagerName:
        raw.kindergartenManagerName !== undefined
          ? raw.kindergartenManagerName
            ? String(raw.kindergartenManagerName).trim()
            : null
          : existing.kindergartenManagerName,
      kindergartenManagerPhone:
        raw.kindergartenManagerPhone !== undefined
          ? raw.kindergartenManagerPhone
            ? String(raw.kindergartenManagerPhone).trim()
            : null
          : existing.kindergartenManagerPhone,
      institutionSymbol:
        raw.institutionSymbol !== undefined
          ? raw.institutionSymbol
            ? String(raw.institutionSymbol).trim()
            : null
          : existing.institutionSymbol,
      basicTrainingDate:
        raw.basicTrainingDate !== undefined
          ? raw.basicTrainingDate
            ? String(raw.basicTrainingDate).trim().slice(0, 10)
            : null
          : existing.basicTrainingDate,
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

  if (
    raw.deliveryMethod !== undefined &&
    String(merged.deliveryMethod ?? "") !==
      String(existing.deliveryMethod ?? "")
  ) {
    await cascadeLeadCertifyingBodyToInternalParticipants(
      leadId,
      merged.deliveryMethod,
    );
  }

  if (raw.sessionsJson !== undefined) {
    await replaceTrainingSessions(
      leadId,
      raw.sessionsJson ? String(raw.sessionsJson) : null,
      {
        city: merged.shippingCity || merged.city,
        street: merged.shippingStreet,
        houseNumber: merged.shippingHouseNo,
      },
    )
  }

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
      courseStatus: true,
      paymentStatus: true,
      agreedPrice: true,
      kindergartenManagerName: true,
      kindergartenManagerPhone: true,
      institutionSymbol: true,
      basicTrainingDate: true,
    },
  });
  if (after) {
    await syncUnassignedInstructorTask(after);
    await syncUnpaidPaymentTask(after);
    await syncYossiAmarDetailsTask(after);
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

  if (
    raw.paymentReceiptIssued !== undefined ||
    raw.paymentStatus !== undefined ||
    raw.agreedPrice !== undefined ||
    raw.totalPrice !== undefined ||
    raw.paymentDate !== undefined
  ) {
    const paymentDateRaw =
      raw.paymentDate !== undefined && raw.paymentDate
        ? String(raw.paymentDate).slice(0, 10)
        : undefined
    await syncReceiptExpenseForLead(leadId, {
      paymentDate: paymentDateRaw,
    })
  }

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
  revalidatePath("/certificates");
  revalidatePath("/clients");
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
      courseStatus: true,
      paymentStatus: true,
      agreedPrice: true,
      kindergartenManagerName: true,
      kindergartenManagerPhone: true,
      institutionSymbol: true,
      basicTrainingDate: true,
    },
  });
  if (after) {
    await syncUnassignedInstructorTask(after);
    await syncUnpaidPaymentTask(after);
    await syncYossiAmarDetailsTask(after);
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
      courseStatus: true,
      paymentStatus: true,
      agreedPrice: true,
      kindergartenManagerName: true,
      kindergartenManagerPhone: true,
      institutionSymbol: true,
      basicTrainingDate: true,
    },
  });
  if (after) {
    await syncUnassignedInstructorTask(after);
    await syncUnpaidPaymentTask(after);
    await syncYossiAmarDetailsTask(after);
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
    amount?: number;
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
  const amount =
    data.amount != null && Number.isFinite(Number(data.amount))
      ? Number(data.amount)
      : undefined
  if (amount != null && amount < 0) {
    return { ok: false, error: "סכום תשלום לא תקין" };
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

  await syncReceiptExpenseForLead(leadId, {
    leadAmountOverride: amount,
    paymentDate: data.paymentDate.trim(),
  });

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      fullName: true,
      paymentStatus: true,
      scheduledStart: true,
      agreedPrice: true,
    },
  });
  if (after) await syncUnpaidPaymentTask(after);

  await tryAutoCompleteTrainingIfReady(leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/payment-history");
  return { ok: true, data: { id: leadId } };
}

/** משלים מודרכים גלובליים למשתתפים חיצוניים שטרם נכנסו למאגר */
export async function ensureExternalParticipantsInDirectory() {
  const orphans = await prisma.participant.findMany({
    where: { isExternal: true, traineeId: null },
    take: 250,
    orderBy: { createdAt: "desc" },
  });
  for (const p of orphans) {
    await linkParticipantToTrainee(p);
  }
  return orphans.length;
}

/** הוספת משתתף פנימית — מספיק שדה אחד (שם / ת״ז / טלפון / אימייל) */
export async function addParticipant(
  leadId: string,
  fullName: string,
  idNumber: string,
  extras?: { phone?: string | null; email?: string | null },
) {
  const name = fullName.trim();
  const id = normalizeParticipantIdNumber(idNumber);
  const phone = extras?.phone?.trim() || "";
  const email = extras?.email?.trim() || "";
  if (!name && !id && !phone && !email) {
    return {
      ok: false as const,
      error: "יש למלא לפחות שדה אחד (שם, ת״ז, טלפון או אימייל)",
    };
  }

  // ת״ז ייחודית בהדרכה — אם כבר קיים, ממלאים חסרים בלבד (לא דורסים נתונים תקינים)
  if (isUsableParticipantIdNumber(id)) {
    const result = await upsertParticipantOnLead({
      leadId,
      mergeMode: "preferExisting",
      data: {
        fullName: name || undefined,
        idNumber: id,
        phone: phone || undefined,
        email: email || undefined,
        source: "manual",
      },
    });
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/clients");
    if (result.created) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      let status = lead?.courseStatus;
      if (status === "completed") {
        await prisma.lead.update({
          where: { id: leadId },
          data: { courseStatus: "certificates_pending" },
        });
        status = "certificates_pending";
      }
      if (status === "certificates_pending" && isGoogleSheetsConfigured()) {
        await exportLeadParticipantsToSheets(leadId);
      }
    }
    return {
      ok: true as const,
      data: {
        id: result.participantId,
        participantId: result.participantId,
        updated: result.updated,
      },
    };
  }

  // בלי ת״ז תקינה — יצירה רגילה (אין מפתח dedupe)
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

/** מצטרף נוסף / משתתף חיצוני */
export async function addExternalParticipant(input: {
  leadId: string
  fullName?: string
  phone?: string
  idNumber?: string
  email?: string
  courseType?: string
  courseCategory?: string
  agreedPrice?: number
  isExternal?: boolean
  isLead?: boolean
  feedback?: string
}): Promise<
  ActionResult<{ id: string; participantId: string; updated: boolean }>
> {
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } })
  if (!lead) return { ok: false, error: "הדרכה לא נמצאה" }
  const ui = dbStatusToUi(lead.courseStatus)
  if (ui !== "new" && ui !== "closed" && ui !== "pending_certificates") {
    return {
      ok: false,
      error:
        "ניתן לשייך מצטרף נוסף רק להדרכה בסטטוס ליד חדש, נרשם ביומן או ממתין לתעודות",
    }
  }
  const name = (input.fullName || "").trim()
  const id = normalizeParticipantIdNumber(input.idNumber)
  const phone = (input.phone || "").trim()
  const email = (input.email || "").trim()
  if (!name && !id && !phone && !email) {
    return {
      ok: false,
      error: "יש למלא לפחות שדה אחד",
    }
  }
  const isExternal = input.isExternal !== false
  const courseSaved = isExternal && input.courseType?.trim()
    ? resolveCourseTypeForSave(input.courseType.trim())
    : null
  const certifyingBody = resolveParticipantCertifyingBodyOnCreate({
    isExternal,
    leadDeliveryMethod: lead.deliveryMethod,
  })
  const participantData = {
    fullName: name || "מצטרף נוסף",
    idNumber: id,
    phone: phone || null,
    email: email || null,
    isExternal,
    isLead: Boolean(input.isLead),
    feedback: input.feedback?.trim() || null,
    courseType: courseSaved?.courseType || input.courseType?.trim() || null,
    courseCategory: isExternal
      ? input.courseCategory?.trim() || null
      : null,
    agreedPrice:
      input.agreedPrice != null && Number.isFinite(input.agreedPrice)
        ? Number(input.agreedPrice)
        : null,
    certifyingBody,
  }

  if (isUsableParticipantIdNumber(id)) {
    const result = await upsertParticipantOnLead({
      leadId: input.leadId,
      mergeMode: "preferExisting",
      data: {
        fullName: name || undefined,
        idNumber: id,
        phone: phone || undefined,
        email: email || undefined,
        isExternal,
        isLead: Boolean(input.isLead),
        feedback: input.feedback?.trim() || undefined,
        courseType: participantData.courseType || undefined,
        courseCategory: participantData.courseCategory || undefined,
        agreedPrice: participantData.agreedPrice,
        certifyingBody: certifyingBody,
        source: "manual",
      },
    })
    if (
      result.created &&
      lead.courseStatus === "certificates_pending" &&
      isGoogleSheetsConfigured()
    ) {
      await exportLeadParticipantsToSheets(input.leadId)
    }
    revalidatePath("/")
    revalidatePath("/leads")
    revalidatePath(`/leads/${input.leadId}`)
    revalidatePath("/clients")
    return {
      ok: true,
      data: {
        id: result.participantId,
        participantId: result.participantId,
        updated: result.updated,
      },
    }
  }

  const created = await prisma.participant.create({
    data: {
      leadId: input.leadId,
      ...participantData,
    },
  })
  await syncParticipantContactToTrainee(created)
  if (
    lead.courseStatus === "certificates_pending" &&
    isGoogleSheetsConfigured()
  ) {
    await exportLeadParticipantsToSheets(input.leadId)
  }
  revalidatePath("/")
  revalidatePath("/leads")
  revalidatePath(`/leads/${input.leadId}`)
  revalidatePath("/clients")
  return { ok: true, data: { id: created.id, participantId: created.id, updated: false } }
}

export async function recordParticipantPayment(
  participantId: string,
  leadId: string,
  data: {
    paymentDate: string
    paymentMethod: string
    paymentReceivedBy: string
    paymentReceiptIssued?: boolean
    amount?: number
  },
): Promise<ActionResult<{ id: string }>> {
  const date = data.paymentDate?.trim()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "תאריך תשלום לא תקין" }
  }
  const amount =
    data.amount != null && Number.isFinite(Number(data.amount))
      ? Number(data.amount)
      : undefined
  if (amount != null && amount < 0) {
    return { ok: false, error: "סכום תשלום לא תקין" }
  }
  await prisma.participant.update({
    where: { id: participantId },
    data: {
      paymentStatus: PAID_PAYMENT_STATUS,
      paymentDate: jerusalemLocalToUtcDate(date, "12:00"),
      paymentMethod: data.paymentMethod.trim() || null,
      paymentReceivedBy: data.paymentReceivedBy.trim() || null,
      paymentReceiptIssued: Boolean(data.paymentReceiptIssued),
      ...(amount != null ? { agreedPrice: amount } : {}),
    },
  })

  await syncReceiptExpenseForLead(leadId, { paymentDate: date })

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      fullName: true,
      paymentStatus: true,
      scheduledStart: true,
      agreedPrice: true,
    },
  })
  if (after) await syncUnpaidPaymentTask(after)

  revalidatePath(`/leads/${leadId}`)
  revalidatePath("/")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
  revalidatePath("/payment-history")
  return { ok: true, data: { id: participantId } }
}

/**
 * יומן תשלומים שטוח — משתתפים, מכירות הדרכה, מכירות בודדות ותשלומי בסיס.
 */
export async function getAllPaymentTransactionsAction(): Promise<
  ActionResult<PaymentTransaction[]>
> {
  try {
    const [participants, sales, trainingLeads, equipmentLeads] =
      await Promise.all([
        prisma.participant.findMany({
          where: {
            isLead: false,
            OR: [
              { agreedPrice: { gt: 0 } },
              { paymentStatus: { not: null } },
            ],
            // הדרכה אבודה/מבוטלת — בלי צפייה לגבייה
            lead: { courseStatus: { not: "canceled" } },
          },
          select: {
            id: true,
            fullName: true,
            isExternal: true,
            agreedPrice: true,
            paymentStatus: true,
            paymentDate: true,
            paymentMethod: true,
            paymentReceivedBy: true,
            createdAt: true,
            leadId: true,
            lead: {
              select: {
                id: true,
                fullName: true,
                activityType: true,
                courseStatus: true,
              },
            },
          },
        }),
        prisma.trainingSale.findMany({
          where: {
            OR: [
              { leadId: null },
              { lead: { courseStatus: { not: "canceled" } } },
            ],
          },
          select: {
            id: true,
            leadId: true,
            quantity: true,
            unitSellingPrice: true,
            paymentStatus: true,
            paymentMethod: true,
            createdAt: true,
            inventoryItem: { select: { name: true } },
            participant: { select: { fullName: true } },
            reportedByInstructor: { select: { name: true } },
            lead: {
              select: { id: true, fullName: true, courseStatus: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.lead.findMany({
          where: {
            activityType: { not: "equipment" },
            courseStatus: { in: [...PAYMENT_LEDGER_ELIGIBLE_COURSE_STATUSES] },
            OR: [
              { agreedPrice: { gt: 0 } },
              { paymentStatus: PAID_PAYMENT_STATUS },
              { paymentDate: { not: null } },
            ],
          },
          select: {
            id: true,
            fullName: true,
            agreedPrice: true,
            paymentStatus: true,
            paymentDate: true,
            paymentMethod: true,
            paymentReceivedBy: true,
            createdAt: true,
            scheduledStart: true,
          },
        }),
        prisma.lead.findMany({
          where: {
            activityType: { in: ["equipment", "combined"] },
            courseStatus: { not: "canceled" },
            OR: [
              { paymentStatus: PAID_PAYMENT_STATUS },
              { paymentDate: { not: null } },
              {
                equipmentStatus: {
                  in: [
                    "completed_paid",
                    "supplied_invoiced",
                    "pending_payment",
                    "requisition_received",
                    "paid",
                    "invoice",
                    "order",
                  ],
                },
              },
            ],
          },
          select: {
            id: true,
            fullName: true,
            reason: true,
            courseType: true,
            agreedPrice: true,
            paymentStatus: true,
            paymentDate: true,
            paymentMethod: true,
            paymentReceivedBy: true,
            equipmentStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ])

    const rows: PaymentTransaction[] = []

    for (const p of participants) {
      if (p.lead?.activityType === "equipment") continue
      const row = buildParticipantTransaction({
        id: p.id,
        isExternal: p.isExternal,
        fullName: p.fullName,
        agreedPrice: p.agreedPrice,
        paymentStatus: p.paymentStatus,
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        paymentReceivedBy: p.paymentReceivedBy,
        createdAt: p.createdAt,
        leadId: p.leadId,
        leadName: p.lead?.fullName ?? null,
      })
      if (!row) continue
      if (
        row.paymentStatus === "pending" &&
        p.lead &&
        !isLeadEligibleForPaymentLedger(p.lead.courseStatus)
      ) {
        continue
      }
      rows.push(row)
    }

    for (const s of sales) {
      const row = buildSaleTransaction({
        id: s.id,
        leadId: s.leadId,
        leadName: s.lead?.fullName ?? null,
        itemName: s.inventoryItem?.name || "פריט",
        quantity: s.quantity,
        unitSellingPrice: s.unitSellingPrice,
        paymentStatus: s.paymentStatus,
        paymentMethod: s.paymentMethod,
        participantName: s.participant?.fullName,
        reportedByName: s.reportedByInstructor?.name,
        createdAt: s.createdAt,
      })
      if (
        row.paymentStatus === "pending" &&
        s.lead &&
        !isLeadEligibleForPaymentLedger(s.lead.courseStatus)
      ) {
        continue
      }
      rows.push(row)
    }

    for (const lead of trainingLeads) {
      const row = buildTrainingBaseTransaction({
        id: lead.id,
        fullName: lead.fullName,
        amount: lead.agreedPrice,
        paymentStatus: lead.paymentStatus,
        paymentDate: lead.paymentDate,
        paymentMethod: lead.paymentMethod,
        paymentReceivedBy: lead.paymentReceivedBy,
        createdAt: lead.createdAt,
        trainingDate: lead.scheduledStart,
      })
      if (row) rows.push(row)
    }

    for (const lead of equipmentLeads) {
      const row = buildEquipmentDealTransaction({
        id: lead.id,
        title: lead.reason || lead.courseType || "עסקת ציוד",
        contactName: lead.fullName,
        amount: lead.agreedPrice,
        paymentStatus: lead.paymentStatus,
        paymentDate: lead.paymentDate,
        paymentMethod: lead.paymentMethod,
        paymentReceivedBy: lead.paymentReceivedBy,
        equipmentStatus: lead.equipmentStatus,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      })
      if (row) rows.push(row)
    }

    return { ok: true, data: sortPaymentTransactions(rows) }
  } catch (error) {
    console.error("[getAllPaymentTransactionsAction]", error)
    return { ok: false, error: "שגיאה בטעינת היסטוריית תשלומים" }
  }
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
  satisfaction?: string;
  feedback?: string;
  kitInterest?: string;
  shippingCity?: string;
  shippingStreet?: string;
  shippingHouseNo?: string;
  shippingZip?: string;
};

export async function submitPublicParticipant(
  leadId: string,
  data: PublicParticipantInput,
): Promise<
  ActionResult<{ id: string; participantId: string; updated: boolean }>
> {
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

  const idNumber = normalizeParticipantIdNumber(data.idNumber);
  if (!isUsableParticipantIdNumber(idNumber)) {
    return { ok: false, error: "מספר תעודת זהות לא תקין" };
  }

  const result = await upsertParticipantOnLead({
    leadId,
    mergeMode: "preferIncoming",
    activityNote: "פרטי המשתתף עודכנו אוטומטית מרישום בקישור/Wix",
    data: {
      fullName: data.fullName.trim(),
      idNumber,
      organizerName: data.organizerName.trim(),
      courseDate: data.courseDate.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      satisfaction: data.satisfaction?.trim() || null,
      feedback: data.feedback?.trim() || null,
      kitInterest: data.kitInterest?.trim() || null,
      shippingCity: data.shippingCity?.trim() || null,
      shippingStreet: data.shippingStreet?.trim() || null,
      shippingHouseNo: data.shippingHouseNo?.trim() || null,
      shippingZip: data.shippingZip?.trim() || null,
      source: "public_link",
    },
  });

  // הערה נרשמת גם ביצירה ראשונה דרך קישור — רק בעדכון לפי activityNote ב-upsert.
  // אם נוצר חדש אין הערת עדכון (נכון).

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/p/${leadId}`);
  revalidatePath("/clients");
  return {
    ok: true,
    data: {
      id: result.participantId,
      participantId: result.participantId,
      updated: result.updated,
    },
  };
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
  if (attended) {
    // תמיד מסנכרנים פרטים עדכניים מ-Participant → Trainee (גם אם כבר מקושר)
    traineeId = await syncParticipantContactToTrainee(participant);
  } else {
    traineeId = null;
  }

  await prisma.participant.update({
    where: { id: participantId },
    data: { attended, traineeId },
  });

  if (isGoogleSheetsConfigured()) {
    syncParticipantAttendanceToSheets(participantId, attended).catch((e) =>
      console.error("[syncParticipantAttendanceToSheets]", e),
    );
  }

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
    notes?: string | null;
    isExternal?: boolean;
    isLead?: boolean;
    courseType?: string | null;
    courseCategory?: string | null;
    agreedPrice?: number | null;
    certifyingBody?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const isExternal = Boolean(data.isExternal);
  const isLead = Boolean(data.isLead);
  const courseSaved =
    isExternal && data.courseType?.trim()
      ? resolveCourseTypeForSave(data.courseType.trim())
      : null;
  const agreedPrice =
    data.agreedPrice != null && Number.isFinite(Number(data.agreedPrice))
      ? Number(data.agreedPrice)
      : data.agreedPrice === null
        ? null
        : undefined;
  const certifyingBody =
    data.certifyingBody === undefined
      ? undefined
      : normalizeCertifyingBody(data.certifyingBody) || null;
  const updated = await prisma.participant.update({
    where: { id: participantId },
    data: {
      fullName: data.fullName?.trim(),
      idNumber: data.idNumber?.trim()
        ? normalizeParticipantIdNumber(data.idNumber)
        : data.idNumber?.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      feedback: data.feedback?.trim() || null,
      ...(data.notes !== undefined
        ? { notes: data.notes?.trim() || null }
        : {}),
      isExternal,
      isLead,
      ...(isExternal
        ? {
            courseType: courseSaved?.courseType || data.courseType?.trim() || null,
            courseCategory: data.courseCategory?.trim() || null,
          }
        : {
            courseType: null,
            courseCategory: null,
          }),
      ...(agreedPrice !== undefined ? { agreedPrice } : {}),
      ...(certifyingBody !== undefined ? { certifyingBody } : {}),
    },
  });
  // סנכרון דו-כיווני: פרטי משתתף → מודרך גלובלי
  await syncParticipantContactToTrainee(updated);
  if (data.notes !== undefined && updated.traineeId) {
    await prisma.trainee.update({
      where: { id: updated.traineeId },
      data: { notes: data.notes?.trim() || null },
    });
  }
  if (certifyingBody !== undefined && updated.traineeId) {
    await prisma.trainee.update({
      where: { id: updated.traineeId },
      data: { certifyingBody },
    });
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  revalidatePath("/leads");
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
    isExternal: Boolean(p.isExternal),
    isLead: Boolean(p.isLead),
    courseType: p.courseType || undefined,
    courseCategory: p.courseCategory || undefined,
    agreedPrice: p.agreedPrice != null ? Number(p.agreedPrice) : undefined,
    paymentStatus: p.paymentStatus || undefined,
    paymentDate: p.paymentDate
      ? formatInJerusalem(p.paymentDate).date
      : undefined,
    paymentMethod: p.paymentMethod || undefined,
    paymentReceivedBy: p.paymentReceivedBy || undefined,
    paymentReceiptIssued: Boolean(p.paymentReceiptIssued),
    source: p.source || undefined,
    notes: p.notes || undefined,
    certifyingBody: normalizeCertifyingBody(
      (p as { certifyingBody?: string | null }).certifyingBody,
    ),
    examScore: p.examScore != null ? Number(p.examScore) : undefined,
    examPassed: Boolean(p.examPassed),
    examCompletedAt: p.examCompletedAt
      ? p.examCompletedAt.toISOString()
      : undefined,
    examDraftAnswers: (() => {
      const raw = p.examDraftAnswers
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v
      }
      return Object.keys(out).length ? out : undefined
    })(),
  }));
}

export async function updateTrainee(
  id: string,
  data: {
    fullName?: string;
    idNumber?: string;
    phone?: string | null;
    email?: string | null;
    /** תעודה דיגיטלית — ניתן לעדכון ידני; Sheets יכול לסנכרן מעל */
    certificateEmailSent?: boolean;
    /** תעודה פיזית — ניתן לעדכון ידני; Sheets יכול לסנכרן מעל */
    certificateCardPrinted?: boolean;
    notes?: string;
    certifyingBody?: string | null;
    /** קישור תעודה קיים (Drive / PDF) */
    certificateUrl?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.trainee.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "המודרך לא נמצא" };

  const nextIdNumber =
    data.idNumber !== undefined
      ? normalizeParticipantIdNumber(data.idNumber) || existing.idNumber
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
  const nextCertifyingBody =
    data.certifyingBody === undefined
      ? undefined
      : normalizeCertifyingBody(data.certifyingBody) || null;
  const nextCertificateUrl =
    data.certificateUrl === undefined
      ? undefined
      : data.certificateUrl?.trim() || null;

  // עדכון מקור המודרך + סנכרון לכל רשומות המשתתף המשויכות
  await prisma.$transaction([
    prisma.trainee.update({
      where: { id },
      data: {
        fullName: nextFullName,
        idNumber: nextIdNumber,
        phone: nextPhone,
        email: nextEmail,
        ...(data.certificateEmailSent !== undefined
          ? { certificateEmailSent: Boolean(data.certificateEmailSent) }
          : {}),
        ...(data.certificateCardPrinted !== undefined
          ? { certificateCardPrinted: Boolean(data.certificateCardPrinted) }
          : {}),
        notes:
          data.notes === undefined ? undefined : data.notes.trim() || null,
        ...(nextCertifyingBody !== undefined
          ? { certifyingBody: nextCertifyingBody }
          : {}),
        ...(nextCertificateUrl !== undefined
          ? { certificateUrl: nextCertificateUrl }
          : {}),
      },
    }),
    prisma.participant.updateMany({
      where: { traineeId: id },
      data: {
        fullName: nextFullName,
        idNumber: nextIdNumber,
        phone: nextPhone,
        email: nextEmail,
        ...(nextCertifyingBody !== undefined
          ? { certifyingBody: nextCertifyingBody }
          : {}),
        ...(nextCertificateUrl !== undefined
          ? { certificateUrl: nextCertificateUrl }
          : {}),
      },
    }),
  ]);

  const linked = await prisma.participant.findMany({
    where: { traineeId: id },
    select: { leadId: true, id: true },
  });
  if (
    nextCertificateUrl !== undefined &&
    isGoogleSheetsConfigured() &&
    linked.length
  ) {
    const sheetsSync = await syncCertificateUrlsForParticipantIds(
      linked.map((p) => p.id),
    );
    if (!sheetsSync.ok) {
      console.error("[updateTrainee] sheets cert url sync", sheetsSync.error);
    }
  }
  for (const p of linked) {
    revalidatePath(`/leads/${p.leadId}`);
  }
  revalidatePath("/clients");
  revalidatePath("/leads");
  revalidatePath("/certificates");
  return { ok: true, data: { id } };
}

/** סנכרון ידני: מוסיף נוכחים חסרים, מושך סטטוסים מהגיליון, ודוחף טקסט סטטוס מה-CRM */
export async function syncCertificatesFromSheetsAction(): Promise<
  ActionResult<{ updated: number; autoCompleted: number; exported: number }>
> {
  let exported = 0;
  if (isGoogleSheetsConfigured()) {
    const push = await exportMissingAttendedToSheets();
    if (!push.ok) return { ok: false, error: push.error };
    exported = push.exported;
  }
  const res = await syncCertificateFlagsFromSheets();
  if (!res.ok) return { ok: false, error: res.error };
  if (isGoogleSheetsConfigured()) {
    const statusPush = await syncCertificateStatusesToSheets();
    if (!statusPush.ok) return { ok: false, error: statusPush.error };
  }
  revalidatePath("/clients");
  revalidatePath("/leads");
  revalidatePath("/certificates");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return {
    ok: true,
    data: { updated: res.updated, autoCompleted: res.autoCompleted, exported },
  };
}

/** ייצוא ידני של משתתפי הדרכה ל-Google Sheets */
export async function exportLeadCertificatesToSheetsAction(
  leadId: string,
): Promise<ActionResult<{ exported: number; attendanceUpdated: number }>> {
  const res = await exportLeadParticipantsToSheets(leadId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return {
    ok: true,
    data: {
      exported: res.exported,
      attendanceUpdated: res.attendanceUpdated,
    },
  };
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

  let templateType = String(input.templateType || "REGULAR").toUpperCase();
  if (!["REGULAR", "REFRESH", "SKIPPERS", "BLS"].includes(templateType)) {
    return { ok: false, error: "סוג תעודה לא תקין" };
  }

  const leadIdFilter = String(input.leadId || "").trim() || undefined;

  // משתתפי הדרכה (participant.id) ו/או מודרכים ללא שיוך (trainee.id)
  const ownedParticipants = await prisma.participant.findMany({
    where: {
      id: { in: ids },
      ...(leadIdFilter ? { leadId: leadIdFilter } : {}),
    },
    select: {
      id: true,
      leadId: true,
      traineeId: true,
      fullName: true,
      idNumber: true,
      phone: true,
      email: true,
      courseDate: true,
      organizerName: true,
      attended: true,
      shippingCity: true,
      shippingStreet: true,
      shippingHouseNo: true,
      shippingZip: true,
      isExternal: true,
      courseType: true,
      courseCategory: true,
      certificateUrl: true,
      trainee: {
        select: { certificateUrl: true },
      },
      lead: {
        select: {
          fullName: true,
          courseType: true,
          courseTypeOther: true,
          courseCategory: true,
          courseCategoryOther: true,
        },
      },
    },
  });
  const foundParticipantIds = new Set(ownedParticipants.map((p) => p.id));
  const remainingIds = ids.filter((id) => !foundParticipantIds.has(id));

  const ownedTrainees =
    remainingIds.length && !leadIdFilter
      ? await prisma.trainee.findMany({
          where: { id: { in: remainingIds } },
          select: { id: true, certificateUrl: true },
        })
      : [];

  const linkedFromTrainees =
    ownedTrainees.length > 0
      ? await prisma.participant.findMany({
          where: { traineeId: { in: ownedTrainees.map((t) => t.id) } },
          select: {
            id: true,
            leadId: true,
            traineeId: true,
            fullName: true,
            idNumber: true,
            phone: true,
            email: true,
            courseDate: true,
            organizerName: true,
            attended: true,
            shippingCity: true,
            shippingStreet: true,
            shippingHouseNo: true,
            shippingZip: true,
            isExternal: true,
            courseType: true,
            courseCategory: true,
            certificateUrl: true,
            trainee: {
              select: { certificateUrl: true },
            },
            lead: {
              select: {
                fullName: true,
                courseType: true,
                courseTypeOther: true,
                courseCategory: true,
                courseCategoryOther: true,
              },
            },
          },
        })
      : [];

  const webhookIds = [
    ...new Set(
      [
        ...ownedParticipants.map((p) => p.id),
        ...ownedParticipants
          .map((p) => p.traineeId)
          .filter((id): id is string => Boolean(id)),
        ...ownedTrainees.map((t) => t.id),
        ...linkedFromTrainees.map((p) => p.id),
      ].filter(Boolean),
    ),
  ];
  if (!webhookIds.length) {
    return {
      ok: false,
      error: leadIdFilter
        ? "לא נמצאו משתתפים תואמים בהדרכה זו"
        : "לא נמצאו מודרכים/משתתפים תואמים לבחירה",
    };
  }

  const sheetText = (value: string | null | undefined): string =>
    value?.trim() ? value.trim() : "";

  const participantsById = new Map(
    [...ownedParticipants, ...linkedFromTrainees].map((p) => [p.id, p]),
  );

  const participantPayload = [...participantsById.values()].map((p) => {
    const cert = resolveParticipantCertificateCourseType(p);
    const scope = certificateScopeForSheet(
      cert.courseType,
      cert.courseTypeOther,
    );
    const label = formatCourseTypeLabel(cert.courseType, {
      other: cert.courseTypeOther,
    });
    const courseTypeLabel =
      scope.includes("רענון") ? scope : label === "קורס" ? "" : label;
    const street = sheetText(p.shippingStreet);
    const zip = sheetText(p.shippingZip);
    const inviter = sheetText(p.organizerName) || sheetText(p.lead?.fullName);
    const attendanceStatus = p.attended ? "TRUE" : "לא נכח";
    const certificatePdfUrl =
      sheetText(p.certificateUrl) ||
      sheetText(
        (p as { trainee?: { certificateUrl?: string | null } }).trainee
          ?.certificateUrl,
      );
    return {
      id: p.id,
      crmId: p.id,
      fullName: sheetText(p.fullName),
      idNumber: sheetText(p.idNumber),
      phone: sheetText(p.phone),
      email: sheetText(p.email),
      courseDate: sheetText(p.courseDate),
      // כתובת מגורים — תמיד מחרוזת (ריקה אם חסר) → עמודות P–S
      city: sheetText(p.shippingCity),
      address: street,
      street,
      houseNumber: sheetText(p.shippingHouseNo),
      zipCode: zip,
      postalCode: zip,
      inviterName: inviter,
      organizerName: inviter,
      hours: scope,
      hoursScope: scope,
      attendance: Boolean(p.attended),
      attendanceStatus,
      isExternal: Boolean(p.isExternal),
      isRefresh: isRefreshCourseType(cert.courseType, cert.courseTypeOther),
      isBls: templateType === "BLS",
      courseType:
        p.isExternal && p.courseType?.trim()
          ? p.courseType.trim()
          : cert.courseType,
      courseTypeLabel,
      courseCategory:
        p.isExternal && p.courseCategory?.trim()
          ? p.courseCategory.trim()
          : p.lead?.courseCategoryOther || p.lead?.courseCategory || "",
      // קישור תעודה קיים — מאפשר ל-Apps Script לדלג על יצירת PDF
      certificateUrl: certificatePdfUrl,
      certificatePdfUrl,
      pdfUrl: certificatePdfUrl,
    };
  });

  if (
    templateType === "REGULAR" &&
    participantPayload.some((p) => p.isRefresh)
  ) {
    templateType = "REFRESH";
  }

  // ייצוא חסרים לגיליון לפני ההנפקה
  if (isGoogleSheetsConfigured()) {
    const leadIds = [
      ...new Set(
        [...ownedParticipants, ...linkedFromTrainees].map((p) => p.leadId),
      ),
    ];
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

    const hoursSync = await syncCertificateHoursForParticipantIds(webhookIds);
    if (!hoursSync.ok) {
      console.error("[triggerRemoteCertificates] hours sync", hoursSync.error);
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

  // חשוב: לא לשלוח participantsToAdd כאן —
  // הסקריפט מפרש participantsToAdd כ־action=sync ודולג על הנפקת תעודות.
  const payload = {
    action: "generateCertificates",
    templateType,
    participantIds: webhookIds,
    authPin: pin,
    pin,
    leadId: leadIdFilter || ownedParticipants[0]?.leadId || null,
    participants: participantPayload,
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

function normalizeMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

type AssignableLeadResolve =
  | { ok: true; leadId: string }
  | { ok: false; reason: "not_found" | "ended" | "lost" };

function assignableLeadError(
  reason: "not_found" | "ended" | "lost",
): string {
  switch (reason) {
    case "ended":
      return "לא ניתן לשייך להדרכה שהסתיימה";
    case "lost":
      return "לא ניתן לשייך להדרכה שסומנה כאבודה/מבוטלת";
    default:
      return "ההדרכה אינה זמינה לשיוך";
  }
}

async function resolveAssignableLead(opts: {
  leadId?: string;
  organizerName?: string;
  trainingDate?: string;
}): Promise<AssignableLeadResolve> {
  if (opts.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: opts.leadId } });
    if (!lead) return { ok: false, reason: "not_found" };
    if (lead.courseStatus === "closed_won") {
      return { ok: false, reason: "ended" };
    }
    if (lead.courseStatus === "canceled") {
      return { ok: false, reason: "lost" };
    }
    if (
      (ASSIGNABLE_LEAD_DB_STATUSES as readonly string[]).includes(
        lead.courseStatus,
      )
    ) {
      return { ok: true, leadId: lead.id };
    }
    return { ok: false, reason: "not_found" };
  }

  const organizer = opts.organizerName?.trim();
  if (!organizer) return { ok: false, reason: "not_found" };

  const candidates = await prisma.lead.findMany({
    where: { courseStatus: { in: [...ASSIGNABLE_LEAD_DB_STATUSES] } },
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

  if (byName.length === 1) return { ok: true, leadId: byName[0].id };
  if (byName.length > 1 && opts.trainingDate) {
    const day = opts.trainingDate.trim().slice(0, 10);
    const dated = byName.find((l) => {
      if (!l.scheduledStart) return false;
      const iso = l.scheduledStart.toISOString().slice(0, 10);
      return iso === day;
    });
    if (dated) return { ok: true, leadId: dated.id };
  }
  if (byName[0]) return { ok: true, leadId: byName[0].id };
  return { ok: false, reason: "not_found" };
}

async function findAssignableLeadId(opts: {
  leadId?: string;
  organizerName?: string;
  trainingDate?: string;
}): Promise<string | null> {
  const resolved = await resolveAssignableLead(opts);
  return resolved.ok ? resolved.leadId : null;
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
  const idNumberRaw = normalizeParticipantIdNumber(data.idNumber);
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
    const resolved = await resolveAssignableLead({ leadId: data.leadId });
    if (!resolved.ok) {
      return { ok: false, error: assignableLeadError(resolved.reason) };
    }
    const leadId = resolved.leadId;

    const idNumber = trainee.idNumber;
    if (idNumberRaw && isUsableParticipantIdNumber(idNumberRaw)) {
      const result = await upsertParticipantOnLead({
        leadId,
        mergeMode: "preferExisting",
        data: {
          fullName: trainee.fullName,
          idNumber: idNumberRaw,
          phone: phone || undefined,
          email: email || undefined,
          traineeId: trainee.id,
          attended: true,
          source: "manual",
        },
      });
      participantId = result.participantId;
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
    const idNumber = normalizeParticipantIdNumber(row.idNumber);
    if (!fullName) {
      skipped += 1;
      errors.push(`שורה ${i + 1}: חסר שם מלא`);
      continue;
    }

    try {
      const existing = idNumber
        ? await prisma.trainee.findUnique({ where: { idNumber } })
        : null;
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
        if (idNumber && isUsableParticipantIdNumber(idNumber)) {
          await upsertParticipantOnLead({
            leadId,
            mergeMode: "preferExisting",
            data: {
              fullName,
              idNumber,
              phone: row.phone?.trim() || undefined,
              email: row.email?.trim() || undefined,
              organizerName: row.organizerName?.trim() || undefined,
              courseDate: row.trainingDate?.trim() || undefined,
              satisfaction: row.satisfaction?.trim() || undefined,
              feedback: row.feedback?.trim() || undefined,
              kitInterest: kit || undefined,
              traineeId: trainee.id,
              attended: true,
              source: "import",
            },
          });
        } else {
          const savedIdNumber = trainee.idNumber;
          await prisma.participant.create({
            data: {
              leadId,
              traineeId: trainee.id,
              fullName,
              idNumber: savedIdNumber,
              phone: row.phone?.trim() || null,
              email: row.email?.trim() || null,
              organizerName: row.organizerName?.trim() || null,
              courseDate: row.trainingDate?.trim() || null,
              satisfaction: row.satisfaction?.trim() || null,
              feedback: row.feedback?.trim() || null,
              kitInterest: kit,
              attended: true,
              source: "import",
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

  const resolved = await resolveAssignableLead({ leadId });
  if (!resolved.ok) {
    return { ok: false, error: assignableLeadError(resolved.reason) };
  }

  const targetLeadId = resolved.leadId;

  const trainees = await prisma.trainee.findMany({
    where: { id: { in: traineeIds } },
  });

  const leadRow = await prisma.lead.findUnique({
    where: { id: targetLeadId },
    select: { deliveryMethod: true },
  });
  const inheritedBody = resolveParticipantCertifyingBodyOnCreate({
    isExternal: false,
    leadDeliveryMethod: leadRow?.deliveryMethod,
  });

  let linked = 0;
  let skipped = 0;

  for (const t of trainees) {
    const existing = await findParticipantOnLeadByIdNumber(
      targetLeadId,
      t.idNumber,
    );
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
        leadId: targetLeadId,
        traineeId: t.id,
        fullName: t.fullName,
        idNumber: t.idNumber,
        phone: t.phone,
        email: t.email,
        attended: true,
        certifyingBody:
          normalizeCertifyingBody(
            (t as { certifyingBody?: string | null }).certifyingBody,
          ) || inheritedBody,
      },
    });
    linked += 1;
  }

  revalidatePath(`/leads/${targetLeadId}`);
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
  isPackagePurchase?: boolean;
  packageTotalCost?: number | null;
  packageUnitsCount?: number | null;
  components?: { childId: string; quantity: number }[];
}): Promise<ActionResult<{ id: string }>> {
  if (!data.name.trim()) return { ok: false, error: "שם פריט הוא שדה חובה" };

  const isComposite = Boolean(data.isComposite);
  const isPackagePurchase = !isComposite && Boolean(data.isPackagePurchase);
  const packageTotalCost = isPackagePurchase
    ? Math.max(0, Number(data.packageTotalCost) || 0)
    : null;
  const packageUnitsCount = isPackagePurchase
    ? Math.max(0, Number(data.packageUnitsCount) || 0)
    : null;
  const costFromPackage =
    isPackagePurchase &&
    packageTotalCost != null &&
    packageTotalCost > 0 &&
    packageUnitsCount != null &&
    packageUnitsCount > 0
      ? packageTotalCost / packageUnitsCount
      : null;

  const base = {
    name: data.name.trim(),
    category: data.category?.trim() || null,
    sellingPrice: Number(data.sellingPrice) || 0,
    costPrice:
      costFromPackage != null ? costFromPackage : Number(data.costPrice) || 0,
    supplierName: data.supplierName?.trim() || null,
    totalPurchased: isComposite
      ? 0
      : Math.max(0, Number(data.totalPurchased) || 0),
    isComposite,
    isPackagePurchase,
    packageTotalCost,
    packageUnitsCount,
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
    participantId?: string | null
    receiptIssued?: boolean
    reportedByInstructorId?: string | null
    instructorCommissionAmount?: number
    isInstructorReported?: boolean
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
      participantId: opts?.participantId || null,
      receiptIssued: Boolean(opts?.receiptIssued),
      reportedByInstructorId: opts?.reportedByInstructorId || null,
      instructorCommissionAmount: Math.max(
        0,
        Number(opts?.instructorCommissionAmount) || 0,
      ),
      isInstructorReported: Boolean(opts?.isInstructorReported),
    },
  });

  if (leadId) {
    await syncReceiptExpenseForLead(leadId)
  }

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
  revalidatePath("/instructor/dashboard");
  revalidatePath("/payment-history");
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

  if (leadId) await syncReceiptExpenseForLead(leadId)

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/equipment");
  revalidatePath("/payment-history");
  revalidatePath("/");
  return { ok: true, data: { id } };
}

/** עדכון מכירת ציוד קיימת (כמות / מחיר / פריט / תשלום) */
export async function updateTrainingSale(
  id: string,
  leadId: string,
  input: {
    inventoryItemId: string
    quantity: number
    unitSellingPrice: number
    unpaid?: boolean
    paymentMethod?: string | null
    participantId?: string | null
    receiptIssued?: boolean
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.trainingSale.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: "המכירה לא נמצאה" }
  if (existing.leadId && existing.leadId !== leadId) {
    return { ok: false, error: "המכירה לא שייכת להדרכה זו" }
  }

  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0))
  if (!qty) return { ok: false, error: "כמות חייבת להיות לפחות 1" }

  const unpaid = Boolean(input.unpaid)
  const paymentMethod = input.paymentMethod?.trim() || null
  if (!unpaid && !paymentMethod) {
    return { ok: false, error: "יש לבחור איך שולם" }
  }
  const unitSell = Number(input.unitSellingPrice)
  if (!Number.isFinite(unitSell) || unitSell < 0) {
    return { ok: false, error: "יש להזין סכום / עלות" }
  }

  const item = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
  })
  if (!item) return { ok: false, error: "הפריט לא נמצא במלאי" }

  const unitCost = Number(item.costPrice) || Number(item.sellingPrice) || 0
  const wasPending = existing.paymentStatus === TRAINING_SALE_PENDING_PAYMENT
  const nextStatus = unpaid
    ? TRAINING_SALE_PENDING_PAYMENT
    : TRAINING_SALE_PAID

  // התאמת מלאי לפי שינוי פריט/כמות
  if (existing.inventoryItemId !== input.inventoryItemId) {
    await applyInventorySaleDelta(
      existing.inventoryItemId,
      existing.quantity,
      -1,
    )
    await applyInventorySaleDelta(input.inventoryItemId, qty, 1)
  } else if (existing.quantity !== qty) {
    const delta = qty - existing.quantity
    if (delta !== 0) {
      await applyInventorySaleDelta(
        existing.inventoryItemId,
        Math.abs(delta),
        delta > 0 ? 1 : -1,
      )
    }
  }

  await prisma.inventoryItem.update({
    where: { id: input.inventoryItemId },
    data: { sellingPrice: unitSell },
  })

  await prisma.trainingSale.update({
    where: { id },
    data: {
      inventoryItemId: input.inventoryItemId,
      quantity: qty,
      unitSellingPrice: unitSell,
      unitCostPrice: unitCost,
      paymentMethod: unpaid ? null : paymentMethod,
      paymentStatus: nextStatus,
      participantId: input.participantId || null,
      receiptIssued: Boolean(input.receiptIssued),
    },
  })

  // מעקב גבייה: יצירה כשעבר ללא שולם; סגירה כששולם
  if (!wasPending && unpaid && leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        fullName: true,
        courseType: true,
        courseTypeOther: true,
      },
    })
    const productName = item.name?.trim() || "פריט"
    const totalAmount = unitSell * qty
    await prisma.followUpTask.create({
      data: {
        leadId,
        title: unpaidTrainingSaleTaskTitle(productName, totalAmount),
        assignee: "מכירות",
        notes: unpaidTrainingSaleTaskNotes({
          productName,
          totalAmount,
          trainingName: formatCourseTypeLabel(lead?.courseType, {
            other: lead?.courseTypeOther,
          }),
          clientName: lead?.fullName?.trim() || "",
        }),
      },
    })
    revalidatePath("/calendar")
  } else if (wasPending && !unpaid) {
    await prisma.followUpTask.updateMany({
      where: {
        leadId,
        completed: false,
        title: { startsWith: "מעקב גביית תשלום" },
      },
      data: { completed: true },
    })
    revalidatePath("/calendar")
  }

  await syncReceiptExpenseForLead(leadId)

  revalidatePath(`/leads/${leadId}`)
  revalidatePath("/dashboard")
  revalidatePath("/equipment")
  revalidatePath("/payment-history")
  revalidatePath("/instructor/dashboard")
  revalidatePath("/")
  return { ok: true, data: { id } }
}

/** רישום / עדכון תשלום על מכירת ציוד */
export async function recordTrainingSalePayment(
  id: string,
  leadId: string,
  input: {
    paymentMethod: string
    receiptIssued?: boolean
    unitSellingPrice?: number
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.trainingSale.findUnique({
    where: { id },
    include: { inventoryItem: { select: { name: true } } },
  })
  if (!existing) return { ok: false, error: "המכירה לא נמצאה" }
  if (existing.leadId && existing.leadId !== leadId) {
    return { ok: false, error: "המכירה לא שייכת להדרכה זו" }
  }

  const paymentMethod = input.paymentMethod?.trim()
  if (!paymentMethod) {
    return { ok: false, error: "יש לבחור איך שולם" }
  }

  const unitSell =
    input.unitSellingPrice != null && Number.isFinite(Number(input.unitSellingPrice))
      ? Math.max(0, Number(input.unitSellingPrice))
      : existing.unitSellingPrice

  const wasPending = existing.paymentStatus === TRAINING_SALE_PENDING_PAYMENT

  await prisma.trainingSale.update({
    where: { id },
    data: {
      paymentMethod,
      paymentStatus: TRAINING_SALE_PAID,
      receiptIssued: Boolean(input.receiptIssued),
      unitSellingPrice: unitSell,
    },
  })

  if (wasPending) {
    await prisma.followUpTask.updateMany({
      where: {
        leadId,
        completed: false,
        title: { startsWith: "מעקב גביית תשלום" },
      },
      data: { completed: true },
    })
    revalidatePath("/calendar")
  }

  await syncReceiptExpenseForLead(leadId)

  revalidatePath(`/leads/${leadId}`)
  revalidatePath("/dashboard")
  revalidatePath("/payment-history")
  revalidatePath("/")
  return { ok: true, data: { id } }
}

export async function removeParticipant(id: string, leadId: string) {
  try {
    await prisma.participant.delete({ where: { id } });
    await syncReceiptExpenseForLead(leadId);
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/clients");
    revalidatePath("/leads");
    return { ok: true as const };
  } catch (err) {
    console.error("[removeParticipant]", err);
    return {
      ok: false as const,
      error: "לא ניתן למחוק את המשתתף — ייתכן שיש רשומות מקושרות",
    };
  }
}

/** העברת משתתף להדרכה אחרת (ליד חדש / נרשם ביומן) */
export async function transferParticipantToLead(
  participantId: string,
  fromLeadId: string,
  toLeadId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!toLeadId || toLeadId === fromLeadId) {
    return { ok: false, error: "יש לבחור הדרכה אחרת" };
  }

  const target = await prisma.lead.findUnique({ where: { id: toLeadId } });
  if (!target) return { ok: false, error: "הדרכה לא נמצאה" };

  const ui = dbStatusToUi(target.courseStatus);
  if (ui !== "new" && ui !== "closed") {
    return {
      ok: false,
      error: "ניתן להעביר רק להדרכה בסטטוס ליד חדש או נרשם ביומן",
    };
  }

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
  });
  if (!participant || participant.leadId !== fromLeadId) {
    return { ok: false, error: "משתתף לא נמצא בהדרכה זו" };
  }

  const idNumber = normalizeParticipantIdNumber(participant.idNumber);
  if (isUsableParticipantIdNumber(idNumber)) {
    const onTarget = await prisma.participant.findMany({
      where: { leadId: toLeadId },
    });
    const match = findParticipantByIdNumber(onTarget, idNumber);
    if (match && match.id !== participantId) {
      await prisma.participant.update({
        where: { id: match.id },
        data: {
          fullName: participant.fullName || match.fullName,
          phone: participant.phone || match.phone,
          email: participant.email || match.email,
          organizerName: participant.organizerName || match.organizerName,
          courseDate: participant.courseDate || match.courseDate,
          satisfaction: participant.satisfaction || match.satisfaction,
          feedback: participant.feedback || match.feedback,
          kitInterest: participant.kitInterest || match.kitInterest,
          attended: participant.attended || match.attended,
          isExternal: participant.isExternal,
          isLead: participant.isLead,
          courseType: participant.courseType || match.courseType,
          courseCategory: participant.courseCategory || match.courseCategory,
          agreedPrice:
            participant.agreedPrice != null
              ? participant.agreedPrice
              : match.agreedPrice,
          source: participant.source || match.source,
        },
      });
      await prisma.participant.delete({ where: { id: participantId } });
      revalidatePath(`/leads/${fromLeadId}`);
      revalidatePath(`/leads/${toLeadId}`);
      revalidatePath("/leads");
      revalidatePath("/clients");
      return { ok: true, data: { id: match.id } };
    }
  }

  await prisma.participant.update({
    where: { id: participantId },
    data: { leadId: toLeadId },
  });
  revalidatePath(`/leads/${fromLeadId}`);
  revalidatePath(`/leads/${toLeadId}`);
  revalidatePath("/leads");
  revalidatePath("/clients");
  return { ok: true, data: { id: participantId } };
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

export async function updateExpense(
  id: string,
  leadId: string,
  data: { type: string; amount: number; notes?: string | null },
) {
  if (!data.type?.trim() || !data.amount || data.amount <= 0) {
    return { ok: false as const, error: "סוג וסכום חיובי הם שדות חובה" };
  }
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing || existing.leadId !== leadId) {
    return { ok: false as const, error: "ההוצאה לא נמצאה" };
  }
  await prisma.expense.update({
    where: { id },
    data: {
      type: data.type.trim(),
      amount: data.amount,
      notes: data.notes?.trim() || null,
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

/** שומר סוג קורס מותאם לרשימת ההצעות (בלי לדרוס תבניות קיימות) */
export async function ensureCustomCourseTypeOption(courseType: string) {
  const type = courseType.trim();
  if (!type || type === "other" || type === "אחר") {
    return { ok: true as const };
  }
  const existing = await prisma.courseAsset.findUnique({
    where: { courseType: type },
  });
  if (existing) return { ok: true as const };
  await prisma.courseAsset.create({
    data: { courseType: type, title: type },
  });
  revalidatePath("/");
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
  console.info("[LMS Dispatch] sendLmsAccessToSheets start", {
    participantIds,
    targetUrl: process.env.LMS_GOOGLE_APPS_SCRIPT_URL?.trim() || null,
  });

  try {
    const {
      loadLmsAccessParticipants,
      postLmsAccessToSheets,
    } = await import("@/lib/google-sheets/lms-access");

    const loaded = await loadLmsAccessParticipants(participantIds);
    if (!loaded.ok) {
      console.error(`❌ CRM LMS Dispatch Error: ${loaded.error}`);
      return { ok: false, error: loaded.error };
    }

    const posted = await postLmsAccessToSheets(loaded.participants);
    if (!posted.ok) {
      console.error(`❌ CRM LMS Dispatch Error: ${posted.error}`);
      return { ok: false, error: posted.error };
    }

    const okIds = loaded.participants.map((p) => p.participantId);
    console.info("[LMS Dispatch] DB update hasLmsAccess=true attempt", {
      participantIds: okIds,
      count: okIds.length,
    });

    const updated = await prisma.participant.updateMany({
      where: { id: { in: okIds } },
      data: { hasLmsAccess: true },
    });

    console.info("[LMS Dispatch] DB update hasLmsAccess result", {
      requested: okIds.length,
      updatedCount: updated.count,
      participantIds: okIds,
    });

    for (const leadId of loaded.leadIds) {
      revalidatePath(`/leads/${leadId}`);
    }
    revalidatePath("/leads");
    revalidatePath("/");

    console.info("[LMS Dispatch] sendLmsAccessToSheets success", {
      count: okIds.length,
      message: posted.message,
    });

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
    const message =
      err instanceof Error ? err.message : "שגיאה בשליחת פרטי LMS ל-Google Sheets";
    console.error(`❌ CRM LMS Dispatch Error: ${message}`, err);
    return {
      ok: false,
      error: message,
    };
  }
}

/** שליחת קישור זום למייל דרך Google Apps Script */
export async function sendZoomLinkEmailAction(data: {
  email: string;
  fullName: string;
  zoomLink: string;
  date: string;
  dayOfWeek: string;
  startTime: string;
  courseTitle: string;
}): Promise<ActionResult<{ sent: boolean }>> {
  const webhookUrl =
    process.env.LMS_GOOGLE_APPS_SCRIPT_URL?.trim() ||
    process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { ok: false, error: "חסר URL ל-Google Apps Script Webhook" };
  }
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SEND_ZOOM_LINK",
        pin: "214215444",
        ...data,
      }),
    });
    return { ok: true, data: { sent: true } };
  } catch (err) {
    console.error("[sendZoomLinkEmailAction]", err);
    return { ok: false, error: "שגיאה בשליחת קישור הזום למייל" };
  }
}

/** רענון משתתפים מגיליון Wix — מסנן לפי trainingId ומונע כפילויות */
export async function refreshWixParticipantsAction(
  leadId: string,
): Promise<ActionResult<{ added: number; skipped: number; updated: number }>> {
  const res = await refreshParticipantsFromWix(leadId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return {
    ok: true,
    data: { added: res.added, skipped: res.skipped, updated: res.updated },
  };
}
