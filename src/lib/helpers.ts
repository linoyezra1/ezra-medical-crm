import { formatLeadCourseType } from "./course-type";
import { COURSE_CATEGORIES } from "./constants";
import { leadCalendarSessions, sessionLocationLabel } from "./payment";
import type { CourseCatalogItem, Lead, Task } from "./types";
import {
  buildStructuredSummary,
  buildSummaryVars,
  fillSummaryTemplate,
} from "./summary-template";
import {
  formatInJerusalem,
  jerusalemLocalToUtcDate,
  toIcsJerusalemWall,
} from "./timezone";
import { sanitizePhone } from "./utils";

export function cleanPhone(raw: string): string {
  return sanitizePhone(raw);
}

export function formatPhone(phone: string): string {
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3)}`;
  return phone;
}

export function calcTotal(
  pricingType: Lead["pricingType"],
  pricePerUnit: number,
  participantsCount: number,
  globalPrice: number
): number {
  if (pricingType === "per_participant") {
    return (pricePerUnit || 0) * (participantsCount || 0);
  }
  return globalPrice || 0;
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/** משימה פתוחה — לדשבורד וללוח זמנים (ארכיון נשאר בעמוד המשימות) */
export function isOpenTask(
  task: Pick<Task, "done"> & {
    isCompleted?: boolean
    completed?: boolean
    status?: string
  },
): boolean {
  if (task.done || task.isCompleted || task.completed) return false
  const status = (task.status || "").toLowerCase()
  if (status === "completed" || status === "done" || status === "archived") {
    return false
  }
  return true
}

export function formatDate(date?: string): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

const WEEKDAYS_HE = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "יום שבת",
]

/** לדוגמה: יום שני | 12/08/2026 */
export function formatDateWithWeekday(date?: string): string {
  if (!date) return "-"
  const d = new Date(date.includes("T") ? date : `${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return formatDate(date)
  return `${WEEKDAYS_HE[d.getDay()]} | ${formatDate(date)}`
}

const WEEKDAY_NAMES_HE = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
]

export function weekdayNameHe(date?: string): string {
  if (!date) return ""
  const d = new Date(date.includes("T") ? date : `${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ""
  return WEEKDAY_NAMES_HE[d.getDay()]
}

/** הודעת וואטסאפ למשתתף עם קישור זום */
export function zoomInviteWhatsAppMessage(
  fullName: string,
  session: { date: string; time: string; zoomLink?: string },
): string {
  const day = weekdayNameHe(session.date)
  const date = formatDate(session.date)
  const link = session.zoomLink?.trim() || ""
  return [
    `שלום ${fullName},`,
    `שובצת להדרכת עזרה ראשונה בזום ביום ${day} ${date} בשעה ${session.time}.`,
    "מצורף קישור לזום:",
    "",
    link,
    "",
    "בברכה,",
    "עזרה ורפואה",
  ].join("\n")
}

/** @deprecated השתמשו ב־resolveInstructorFee מ־training-profit */
export function instructorPayAmount(lead: {
  expenses?: { type: string; amount: number }[]
  instructorFeeOverride?: number
  instructorId?: string
  instructor?: string
}): number {
  if (
    lead.instructorFeeOverride != null &&
    Number.isFinite(lead.instructorFeeOverride)
  ) {
    return Math.max(0, Number(lead.instructorFeeOverride))
  }
  const exp = (lead.expenses || []).find(
    (e) => e.type === "מדריך" || e.type === "instructor" || e.type === "instructor_fee",
  )
  if (exp) return exp.amount
  return 0
}

/** משך הדרכה לתצוגה */
export function formatTrainingDuration(lead: {
  time?: string
  endTime?: string
  courseHours?: number
}): string {
  if (lead.time && lead.endTime) return `${lead.time}–${lead.endTime}`
  if (lead.courseHours && lead.courseHours > 0) return `${lead.courseHours} שעות`
  return "—"
}

/** צבעי מסגרת + רקע לכרטיס ליד לפי סטטוס */
export function leadStatusCardClass(status: Lead["status"]): string {
  switch (status) {
    // ליד בטיפול / שלא נסגר עדיין
    case "new":
      return "border-orange-400 bg-orange-50/50"
    // נסגר ונכנס ליומן
    case "closed":
      return "border-green-500 bg-green-50/50"
    // הדרכה בוצעה וממתינה לתעודות
    case "pending_certificates":
      return "border-blue-500 bg-blue-50/50"
    // תהליך הסתיים / ארכיון
    case "completed":
    case "lost":
      return "border-slate-300 bg-slate-100/60 text-slate-600"
    default:
      return ""
  }
}

export function findConflicts(
  leads: Lead[],
  date: string,
  time: string,
  excludeId?: string
): Lead[] {
  if (!date || !time) return [];
  const target = jerusalemLocalToUtcDate(date, time).getTime();
  if (Number.isNaN(target)) return [];
  const windowMs = 60 * 60 * 1000;
  return leads.filter((l) => {
    if (l.id === excludeId) return false;
    if (l.status === "lost" || l.status === "new") return false;
    if (!l.date || !l.time) return false;
    const t = jerusalemLocalToUtcDate(l.date, l.time).getTime();
    if (Number.isNaN(t)) return false;
    return Math.abs(t - target) <= windowMs;
  });
}

/**
 * סיכום שיחה מותאם לקורס:
 * 1) אם יש summaryTemplate – ממלא משתנים
 * 2) אחרת בונה מבנה מסודר משדות תכני הקורס
 * 3) נפילה לסיכום בסיסי
 */
export function whatsappSummary(
  lead: Lead,
  course?: CourseCatalogItem | null
): string {
  const vars = buildSummaryVars(lead, course);

  if (course?.summaryTemplate?.trim()) {
    return fillSummaryTemplate(course.summaryTemplate, vars);
  }

  if (course && (course.contents || course.audience || course.pricingText || course.title)) {
    return buildStructuredSummary(lead, course, vars);
  }

  const lines = [
    "סיכום שיחה",
    "",
    `שלום ${vars.contactName || ""},`.trim(),
    "",
    `📘 ${vars.courseTitle || `קורס: ${formatLeadCourseType(lead) || "קורס"}`}`,
    lead.date ? `📅 תאריך: ${formatDate(lead.date)}` : "",
    lead.time ? `⏰ שעה: ${lead.time}` : "",
    vars.location ? `📍 מיקום: ${vars.location}` : "",
    vars.pricingText ? `💰 עלות הקורס:\n${vars.pricingText}` : "",
  ].filter((l) => l !== undefined);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function whatsappLink(phone: string, text?: string): string {
  const clean = cleanPhone(phone);
  const message = text?.trim() ?? "";
  if (!clean) {
    return message
      ? `https://wa.me/?text=${encodeURIComponent(message)}`
      : "https://wa.me/";
  }
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return message
    ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${intl}`;
}

/** הודעת שיתוף פרטי הדרכה למדריך (ללא מספר יעד — בחירה ב‑WhatsApp) */
export function instructorAssignmentWhatsAppMessage(
  lead: Lead,
  opts: { courseLabel: string; registrationUrl: string },
): string {
  const contact = lead.contactName?.trim() || lead.name
  const sessions = leadCalendarSessions(lead)
  const physical = sessions.find((s) => !s.isZoom)
  const address = physical
    ? sessionLocationLabel(physical)
    : sessions.length > 0 && sessions.every((s) => s.isZoom)
      ? "זום"
      : [
          lead.address?.street,
          lead.address?.houseNumber,
          lead.address?.city,
        ]
          .filter(Boolean)
          .join(" ")
  const timeLine = lead.time
    ? `${lead.time}${lead.endTime ? `–${lead.endTime}` : ""}`
    : "—"

  return [
    "📋 פרטי הדרכה :",
    "",
    `📅 תאריך: ${lead.date ? formatDate(lead.date) : "—"}`,
    `⏰ שעה: ${timeLine}`,
    `🎓 סוג הדרכה: ${opts.courseLabel}`,
    `👤 איש קשר: ${contact}`,
    `📞 טלפון איש קשר: ${lead.phone || "—"}`,
    `📍 כתובת: ${address || "—"}`,
    ...(sessions.some((s) => s.isZoom && s.zoomLink?.trim())
      ? [
          `💻 קישור זום: ${
            sessions.find((s) => s.zoomLink?.trim())?.zoomLink?.trim() || ""
          }`,
        ]
      : []),
    "",
    "נא לאשר שקיבלת את ההדרכה",
    "",
    "שים לב יש ליצור קשר יום לפני ההדרכה ולוודא מיקום ופרטים להגעה.",
    "",
    "🔗 קישור לרישום משתתפים להדרכה:",
    opts.registrationUrl,
  ].join("\n")
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((v) => v.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "he"),
  );
}

/** אפשרויות קטגוריה לדרופדאון (ליד / משתתף חיצוני) */
export function collectLeadCategoryOptions(
  leads: Array<Pick<Lead, "category"> & { categoryOther?: string | null }>,
): string[] {
  const fromDb: string[] = [];
  for (const l of leads) {
    if (l.category && l.category !== "אחר") fromDb.push(l.category);
    if (l.categoryOther) fromDb.push(l.categoryOther);
  }
  const fromCatalog = COURSE_CATEGORIES.filter((c) => c.value !== "other").map(
    (c) => c.label,
  );
  return uniqueSorted([...fromCatalog, ...fromDb]);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function missingForClose(lead: Partial<Lead>): string[] {
  const missing: string[] = [];
  if (!lead.date) missing.push("תאריך");
  if (!lead.time) missing.push("שעה");
  const sessions = lead.sessions;
  const allZoom =
    sessions && sessions.length > 0
      ? sessions.every((s) => Boolean(s.isZoom))
      : false;
  if (!allZoom) {
    const sessionHasAddress =
      sessions?.some(
        (s) =>
          !s.isZoom &&
          Boolean(s.street?.trim() && s.city?.trim()),
      ) ?? false;
    if (!sessionHasAddress) {
      missing.push("כתובת");
    }
  }
  return missing;
}

/** בעבר נדרש לכתובת פיזית לפי אופן אספקה — כעת השדה הוא "תעודות דרך מי" */
export function requiresPhysicalAddress(_lead: Lead): boolean {
  return false;
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** בונה תוכן קובץ iCalendar (.ics) — אירוע נפרד לכל מפגש */
export function buildLeadIcsContent(lead: Lead): string {
  const courseTitle = formatLeadCourseType(lead) || "הדרכה";
  const contactName = lead.contactName?.trim() || lead.name;
  const price = Math.round(lead.totalPrice || 0);
  const description = [
    `איש קשר: ${contactName} (${lead.phone})`,
    `מדריך: ${lead.instructor || "-"}`,
    `מחיר: ₪${price}`,
    `הערות: ${lead.notes?.trim() || "-"}`,
  ].join(", ");

  const sessions = leadCalendarSessions(lead);
  const slots =
    sessions.length > 0
      ? sessions
      : lead.date && lead.time
        ? [
            {
              date: lead.date,
              time: lead.time,
              endTime: lead.endTime,
              isZoom: false,
              city: lead.address?.city,
              street: lead.address?.street,
              houseNumber: lead.address?.houseNumber,
            },
          ]
        : [];

  const now = new Date();
  const events = slots.map((slot, idx) => {
    const isZoom = Boolean(slot.isZoom);
    const zoomLink = slot.zoomLink?.trim() || "";
    const city = slot.city?.trim() || "";
    const sessionLabel =
      slots.length > 1 ? ` · מפגש ${idx + 1}` : "";
    const summary = isZoom
      ? `הדרכה - ${courseTitle} - זום${sessionLabel}`
      : `הדרכה - ${courseTitle} - ${city || "ללא עיר"}${sessionLabel}`;
    const location = isZoom ? (zoomLink || "זום") : sessionLocationLabel(slot);
    const eventDescription = zoomLink
      ? `${description}\nקישור זום: ${zoomLink}`
      : description;

    const date = slot.date || lead.date || formatInJerusalem(new Date()).date || "";
    const startTime = slot.time || lead.time || "09:00";
    let endTime = slot.endTime || lead.endTime;
    if (!endTime && date) {
      const startMs = jerusalemLocalToUtcDate(date, startTime).getTime();
      const durationHours =
        lead.courseHours && lead.courseHours > 0 ? lead.courseHours : 4;
      const endParts = formatInJerusalem(
        new Date(startMs + durationHours * 60 * 60 * 1000),
      );
      endTime = endParts.time || "10:00";
    } else if (!endTime) {
      endTime = "10:00";
    }
    if (date && endTime && startTime) {
      const startMs = jerusalemLocalToUtcDate(date, startTime).getTime();
      const endMs = jerusalemLocalToUtcDate(date, endTime).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
        const fixed = formatInJerusalem(new Date(startMs + 60 * 60 * 1000));
        endTime = fixed.time || endTime;
      }
    }

    const uid = `${lead.id || "lead"}-${date}${startTime}-${idx}@ezra-crm`;
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toIcsUtcStamp(now)}`,
      `DTSTART;TZID=Asia/Jerusalem:${toIcsJerusalemWall(date, startTime)}`,
      `DTEND;TZID=Asia/Jerusalem:${toIcsJerusalemWall(date, endTime)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `LOCATION:${icsEscape(location)}`,
      `DESCRIPTION:${icsEscape(eventDescription)}`,
      ...(zoomLink ? [`URL:${icsEscape(zoomLink)}`] : []),
      "END:VEVENT",
    ];
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ezra Ve-Refuah CRM//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flat(),
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * מוריד / פותח קובץ .ics — במובייל נפתח יומן המכשיר (Apple / Google Calendar).
 */
export function downloadLeadIcs(lead: Lead): void {
  const ics = buildLeadIcsContent(lead);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `hadracha-${lead.date || lead.sessions?.[0]?.date || "event"}.ics`;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua);

  if (isIOS) {
    // ב-iOS ניווט לקובץ פותח את יומן Apple
    window.location.href = url;
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}
