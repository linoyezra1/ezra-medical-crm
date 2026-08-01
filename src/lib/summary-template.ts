import { formatCourseTypeLabel } from "./course-type";
import type { CourseCatalogItem, Lead } from "./types";

function formatDate(date?: string): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

/** עיצוב מחיר בסגנון "1,700 ₪" */
export function formatShekelAmount(amount: number): string {
  const n = Math.round(amount || 0);
  return `${new Intl.NumberFormat("he-IL").format(n)} ₪`;
}

/**
 * טקסט מחיר דינמי לסיכום שיחה לפי מודל התמחור של הליד.
 */
export function buildLeadPricingText(
  lead: Lead,
  course?: CourseCatalogItem | null,
): string {
  if (lead.pricingType === "global") {
    const price = lead.totalPrice > 0 ? lead.totalPrice : 0;
    if (!price && course?.pricingText?.trim()) return course.pricingText.trim();
    return `${formatShekelAmount(price)} לקבוצה של עד 25 משתתפים`;
  }

  const unit = lead.pricePerUnit || 0;
  const extra = lead.extraParticipantPrice ?? 50;
  if (!unit && course?.pricingText?.trim()) return course.pricingText.trim();
  return (
    `${formatShekelAmount(unit)} למשתתף (עד 25 משתתפים). ` +
    `במידה ויש משתתפים נוספים, תוספת ${formatShekelAmount(extra)} לכל משתתף נוסף`
  );
}

/** משתנים זמינים בתבנית סיכום שיחה */
export type SummaryVars = Record<string, string>;

export function buildSummaryVars(
  lead: Lead,
  course?: CourseCatalogItem | null,
): SummaryVars {
  const location = [lead.address.street, lead.address.houseNumber, lead.address.city]
    .filter(Boolean)
    .join(" ")
    .trim();

  const pricingText = buildLeadPricingText(lead, course);
  const displayPrice =
    lead.pricingType === "per_participant"
      ? lead.pricePerUnit || 0
      : lead.totalPrice || 0;
  const price = formatShekelAmount(displayPrice);
  const extra = formatShekelAmount(lead.extraParticipantPrice ?? 50);
  const courseLabel = formatCourseTypeLabel(lead.courseType, {
    other: lead.courseTypeOther,
    catalog: course ? [course] : undefined,
  });

  return {
    name: lead.name || "",
    contactName: lead.contactName || lead.name || "",
    phone: lead.phone || "",
    courseTitle: courseLabel || course?.title || lead.courseType || "",
    courseType: courseLabel,
    hours: String(course?.hours || lead.courseHours || ""),
    audience: course?.audience || "",
    duration: course?.durationText || "",
    nature: course?.natureText || "",
    contents: course?.contents || "",
    pricingText,
    price,
    totalPrice: price,
    extraParticipantPrice: extra,
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

  text = text
    .split("\n")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/** בונה סיכום מובנה משדות הקורס (כשאין תבנית מותאמת) */
export function buildStructuredSummary(
  lead: Lead,
  course: CourseCatalogItem,
  vars: SummaryVars,
): string {
  const blocks: string[] = ["סיכום שיחה", "", `שלום ${vars.contactName || ""},`.trim()];

  if (vars.courseTitle || course.title || lead.courseType) {
    blocks.push("", `📘 ${vars.courseTitle || course.title || lead.courseType}`);
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

  const priceLine = vars.pricingText || buildLeadPricingText(lead, course);
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
