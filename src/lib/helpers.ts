import { formatCourseTypeLabel } from "./course-type";
import type { CourseCatalogItem, Lead } from "./types";
import {
  buildStructuredSummary,
  buildSummaryVars,
  fillSummaryTemplate,
} from "./summary-template";
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

export function formatDate(date?: string): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function findConflicts(
  leads: Lead[],
  date: string,
  time: string,
  excludeId?: string
): Lead[] {
  if (!date || !time) return [];
  const target = new Date(`${date}T${time}`).getTime();
  const windowMs = 60 * 60 * 1000;
  return leads.filter((l) => {
    if (l.id === excludeId) return false;
    if (l.status === "lost" || l.status === "new") return false;
    if (!l.date || !l.time) return false;
    const t = new Date(`${l.date}T${l.time}`).getTime();
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
    `📘 ${vars.courseTitle || `קורס: ${formatCourseTypeLabel(lead.courseType, { other: lead.courseTypeOther }) || "קורס"}`}`,
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

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function missingForClose(lead: Partial<Lead>): string[] {
  const missing: string[] = [];
  if (!lead.date) missing.push("תאריך");
  if (!lead.time) missing.push("שעה");
  if (!lead.address?.street || !lead.address?.city) missing.push("כתובת");
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

function toIcsLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toIcsUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** בונה תוכן קובץ iCalendar (.ics) להוספה ליומן המכשיר */
export function buildLeadIcsContent(lead: Lead): string {
  const city = lead.address?.city?.trim() || "";
  const courseTitle =
    formatCourseTypeLabel(lead.courseType, { other: lead.courseTypeOther }) ||
    "הדרכה";
  const summary = `הדרכה - ${courseTitle} - ${city || "ללא עיר"}`;

  const street = [lead.address?.street, lead.address?.houseNumber]
    .filter(Boolean)
    .join(" ")
    .trim();
  const location = [street, city].filter(Boolean).join(", ");

  const contactName = lead.contactName?.trim() || lead.name;
  const price = Math.round(lead.totalPrice || 0);
  const description = [
    `איש קשר: ${contactName} (${lead.phone})`,
    `מדריך: ${lead.instructor || "-"}`,
    `מחיר: ₪${price}`,
    `הערות: ${lead.notes?.trim() || "-"}`,
  ].join(", ");

  // משך: לפי שעות הקורס אם קיים, אחרת 4 שעות
  const durationHours =
    lead.courseHours && lead.courseHours > 0 ? lead.courseHours : 4;
  const start =
    lead.date && lead.time
      ? new Date(`${lead.date}T${lead.time}`)
      : new Date();
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const now = new Date();
  const uid = `${lead.id || "lead"}-${start.getTime()}@ezra-crm`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ezra Ve-Refuah CRM//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtcStamp(now)}`,
    `DTSTART:${toIcsLocalDateTime(start)}`,
    `DTEND:${toIcsLocalDateTime(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `LOCATION:${icsEscape(location)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
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
  const filename = `hadracha-${lead.date || "event"}.ics`;
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
