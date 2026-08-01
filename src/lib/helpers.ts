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
    `📘 ${vars.courseTitle || lead.courseType || "קורס"}`,
    lead.date ? `📅 תאריך: ${formatDate(lead.date)}${lead.time ? ` · ${lead.time}` : ""}` : "",
    vars.location ? `📍 מיקום: ${vars.location}` : "",
    lead.totalPrice > 0 ? `💰 עלות: ${formatCurrency(lead.totalPrice)}` : "",
    "",
    "תעדכני אותי בשביל שנוכל להתקדם",
  ].filter((l) => l !== undefined);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function whatsappLink(phone: string, text: string): string {
  const clean = cleanPhone(phone);
  if (!clean) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
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

export function requiresPhysicalAddress(lead: Lead): boolean {
  return lead.certificateDelivery === "mail" || lead.certificateDelivery === "physical";
}
