import type { CourseCatalogItem, Lead } from "./types";
import { formatCurrency } from "./utils";

function formatDate(date?: string): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

/** משתנים זמינים בתבנית סיכום שיחה */
export type SummaryVars = Record<string, string>;

export function buildSummaryVars(
  lead: Lead,
  course?: CourseCatalogItem | null
): SummaryVars {
  const location = [lead.address.street, lead.address.houseNumber, lead.address.city]
    .filter(Boolean)
    .join(" ")
    .trim();

  const price =
    lead.totalPrice > 0
      ? formatCurrency(lead.totalPrice)
      : course?.pricingText || "";

  return {
    name: lead.name || "",
    contactName: lead.contactName || lead.name || "",
    phone: lead.phone || "",
    courseTitle: course?.title || lead.courseType || "",
    courseType: lead.courseType || "",
    hours: String(course?.hours || lead.courseHours || ""),
    audience: course?.audience || "",
    duration: course?.durationText || "",
    nature: course?.natureText || "",
    contents: course?.contents || "",
    pricingText: course?.pricingText || "",
    price,
    totalPrice: price,
    date: lead.date ? formatDate(lead.date) : "",
    time: lead.time || "",
    location: location || lead.address.city || "",
    city: lead.address.city || "",
    participantsCount: String(lead.participantsCount || ""),
    instructor: lead.instructor || "",
    notes: lead.notes || "",
  };
}

/**
 * ממלא תבנית:
 * - {{var}} מוחלף בערך
 * - שורות שמכילות רק משתנים ריקים מוסרות
 */
export function fillSummaryTemplate(template: string, vars: SummaryVars): string {
  let text = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");

  // הסרת שורות ריקות כפולות אחרי החלפה
  text = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // שמור על שורות ריקות בודדות להפרדה, הסר רצפים
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/** בונה סיכום מובנה משדות הקורס (כשאין תבנית מותאמת) */
export function buildStructuredSummary(
  lead: Lead,
  course: CourseCatalogItem,
  vars: SummaryVars
): string {
  const blocks: string[] = ["סיכום שיחה", "", `שלום ${vars.contactName || ""},`.trim()];

  if (course.title || lead.courseType) {
    blocks.push("", `📘 ${course.title || lead.courseType}`);
  }
  if (course.audience) {
    blocks.push("", "👥 למי הקורס מתאים:", course.audience);
  }
  if (course.durationText) {
    blocks.push("", "⏱️ משך הקורס:", course.durationText);
  }
  if (course.natureText) {
    blocks.push("", "🧠🖐️ אופי הקורס:", course.natureText);
  }
  if (course.contents) {
    blocks.push("", "📚 תכני הקורס:", course.contents);
  }

  const priceLine =
    lead.totalPrice > 0
      ? formatCurrency(lead.totalPrice)
      : course.pricingText || "";
  if (priceLine) {
    blocks.push("", "💰 עלות הקורס:", priceLine);
  }

  if (vars.date && vars.date !== "-") {
    blocks.push("", `📅 תאריך: ${vars.date}${vars.time ? ` · ${vars.time}` : ""}`);
  }
  if (vars.location) {
    blocks.push(`📍 מיקום: ${vars.location}`);
  }

  blocks.push("", "תעדכני אותי בשביל שנוכל להתקדם");
  return blocks.filter((b, i, arr) => !(b === "" && arr[i - 1] === "")).join("\n").trim();
}
