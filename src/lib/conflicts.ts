import { addHours, subHours } from "date-fns";
import { prisma } from "@/lib/db";
import { SCHEDULED_STATUSES } from "@/lib/constants";
import {
  parseSessionsJson,
  physicalAddressMissingForClose,
  sessionLocationLabel,
} from "@/lib/payment";
import { formatInJerusalem } from "@/lib/timezone";
import type { Lead } from "@/generated/prisma/client";

export type ConflictHit = {
  id: string;
  courseType: string | null;
  city: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  instructor: string | null;
  fullName: string;
};

/**
 * Conflict window = [start - 1h, end + 1h]
 * Overlap if existing window intersects current window.
 */
export async function findScheduleConflicts(params: {
  leadId?: string;
  start: Date;
  end: Date;
}): Promise<ConflictHit[]> {
  const windowStart = subHours(params.start, 1);
  const windowEnd = addHours(params.end, 1);

  const candidates = await prisma.lead.findMany({
    where: {
      id: params.leadId ? { not: params.leadId } : undefined,
      courseStatus: { in: [...SCHEDULED_STATUSES] },
      scheduledStart: { not: null },
      scheduledEnd: { not: null },
    },
    select: {
      id: true,
      courseType: true,
      city: true,
      scheduledStart: true,
      scheduledEnd: true,
      instructor: true,
      fullName: true,
    },
  });

  return candidates.filter((c) => {
    if (!c.scheduledStart || !c.scheduledEnd) return false;
    const existingStart = subHours(c.scheduledStart, 1);
    const existingEnd = addHours(c.scheduledEnd, 1);
    return existingStart < windowEnd && existingEnd > windowStart;
  });
}

export type CloseValidationError =
  | { code: "missing_schedule"; message: string }
  | { code: "missing_location"; message: string }
  | { code: "physical_address"; message: string }
  | { code: "participants_required"; message: string }
  | { code: "conflict"; message: string; conflicts: ConflictHit[] };

export async function validateStatusTransition(
  lead: Lead,
  nextStatus: string,
  opts: { bypassConflict?: boolean; participantCount?: number } = {}
): Promise<CloseValidationError | null> {
  if (nextStatus === "closed") {
    if (!lead.scheduledStart || !lead.scheduledEnd) {
      return {
        code: "missing_schedule",
        message: "לא ניתן לסגור קורס ללא תאריך ושעה תקפים",
      };
    }
    const { date, time } = formatInJerusalem(lead.scheduledStart);
    const { time: endTime } = formatInJerusalem(lead.scheduledEnd);
    if (
      physicalAddressMissingForClose({
        sessionsJson: lead.sessionsJson,
        date: date || undefined,
        time: time || undefined,
        endTime: endTime || undefined,
        location: lead.location,
        city: lead.city,
        address: {
          street: lead.shippingStreet ?? undefined,
          city: lead.shippingCity ?? undefined,
          houseNumber: lead.shippingHouseNo ?? undefined,
        },
      })
    ) {
      return {
        code: "missing_location",
        message: "לא ניתן לסגור קורס ללא מיקום / עיר (מפגשי זום פטורים)",
      };
    }
    // התנגשות ביומן = אזהרה בצד הלקוח בלבד (לא חוסמת מעבר ל«סגרנו ביומן»)
  }

  if (
    nextStatus === "closed_won" &&
    (lead.activityType === "course" || lead.activityType === "combined")
  ) {
    const count =
      opts.participantCount ??
      (await prisma.participant.count({ where: { leadId: lead.id } }));
    if (count < 1) {
      return {
        code: "participants_required",
        message: "נדרש לפחות משתתף אחד (שם מלא + ת.ז.) לפני הנפקת תעודות",
      };
    }
  }

  if (
    (lead.deliveryMethod === "physical_print" || lead.deliveryMethod === "postal_mail") &&
    nextStatus === "closed_won"
  ) {
    if (!lead.shippingStreet?.trim() || !lead.shippingHouseNo?.trim() || !lead.shippingCity?.trim()) {
      return {
        code: "physical_address",
        message: "למשלוח פיזי נדרשים רחוב, מספר בית ועיר",
      };
    }
  }

  return null;
}

/** Stub: logs calendar payload until Google OAuth is configured */
export async function syncGoogleCalendar(lead: Lead): Promise<string | null> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const sessions = parseSessionsJson(lead.sessionsJson);
  if (!settings?.calendarEnabled) {
    console.info("[calendar] sync skipped (disabled)", {
      title: `הדרכה - ${lead.courseType ?? "קורס"}`,
      sessions: sessions.map((s) => ({
        date: s.date,
        time: s.time,
        endTime: s.endTime,
        location: sessionLocationLabel(s),
      })),
    });
    return lead.googleCalendarEventId;
  }
  const eventId = lead.googleCalendarEventId ?? `local-${lead.id}`;
  return eventId;
}
