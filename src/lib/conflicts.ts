import { addHours, subHours } from "date-fns";
import { prisma } from "@/lib/db";
import { SCHEDULED_STATUSES } from "@/lib/constants";
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
    if (!lead.location?.trim() && !lead.city?.trim()) {
      return {
        code: "missing_location",
        message: "לא ניתן לסגור קורס ללא מיקום / עיר",
      };
    }
    if (!opts.bypassConflict) {
      const conflicts = await findScheduleConflicts({
        leadId: lead.id,
        start: lead.scheduledStart,
        end: lead.scheduledEnd,
      });
      if (conflicts.length > 0) {
        return {
          code: "conflict",
          message: "זוהתה התנגשות בלוח הזמנים (± שעה)",
          conflicts,
        };
      }
    }
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
  if (!settings?.calendarEnabled) {
    console.info("[calendar] sync skipped (disabled)", {
      title: `הדרכה - ${lead.courseType ?? "קורס"} - ${lead.city ?? ""}`,
      location: `${lead.location ?? ""}, ${lead.city ?? ""} | איש קשר: ${lead.fullName} (${lead.phone})`,
      start: lead.scheduledStart,
      end: lead.scheduledEnd,
    });
    return lead.googleCalendarEventId;
  }
  // Placeholder event id until Google Calendar API credentials are wired
  const eventId = lead.googleCalendarEventId ?? `local-${lead.id}`;
  return eventId;
}
