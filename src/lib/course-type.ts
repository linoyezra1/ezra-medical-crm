import type { CourseCatalogItem, Lead } from "@/lib/types"

export const COURSE_TYPE_OTHER = "אחר"

/** מיפוי מפתחות פנימיים / סלגים → תווית תצוגה */
const SLUG_TO_LABEL: Record<string, string> = {
  "44_hours": "44 שעות",
  "hours-44": "44 שעות",
  "hours_44": "44 שעות",
  "44-hours": "44 שעות",
  "22_hours": "22 שעות",
  "hours-22": "22 שעות",
  "hours_22": "22 שעות",
  "22-hours": "22 שעות",
  "60_hours": "60 שעות",
  "hours-60": "60 שעות",
  "hours_60": "60 שעות",
  "60-hours": "60 שעות",
  paramedic: "חובשים",
  medics: "חובשים",
  medic: "חובשים",
  infant_cpr: "החייאת תינוקות",
  infant_kindergarten: "החייאת תינוקות (גן)",
  other: COURSE_TYPE_OTHER,
  אחר: COURSE_TYPE_OTHER,
}

/** תווית קצרה → מפתח קנוני (לקישור חוברות/נכסים) */
const LABEL_TO_SLUG: Record<string, string> = {
  "44 שעות": "44_hours",
  "22 שעות": "22_hours",
  "60 שעות": "60_hours",
  חובשים: "paramedic",
  חובש: "paramedic",
  "החייאת תינוקות": "infant_cpr",
  "החייאת תינוקות (גן)": "infant_kindergarten",
}

/** תוויות ברירת מחדל שתמיד יופיעו ברשימה */
export const DEFAULT_COURSE_TYPE_LABELS = [
  "22 שעות",
  "44 שעות",
  "60 שעות",
  "חובשים",
  "החייאת תינוקות",
  "החייאת תינוקות (גן)",
] as const

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_")
}

/**
 * ממיר ערך courseType פנימי/סלג לתווית ידידותית למשתמש.
 * ערכים בעברית (כולל קורסים מותאמים) מוחזרים כמו שהם.
 */
export function formatCourseTypeLabel(
  value?: string | null,
  opts?: {
    other?: string | null
    catalog?: CourseCatalogItem[] | null
  },
): string {
  const other = opts?.other?.trim()
  const raw = value?.trim() || ""

  if (!raw) {
    return other || "קורס"
  }

  if ((raw === "other" || raw === COURSE_TYPE_OTHER) && other) {
    return other
  }

  const byExact = SLUG_TO_LABEL[raw] || SLUG_TO_LABEL[normalizeKey(raw)]
  if (byExact && byExact !== COURSE_TYPE_OTHER) return byExact

  const catalog = opts?.catalog
  if (catalog?.length) {
    const match =
      catalog.find((c) => c.type === raw) ||
      catalog.find((c) => c.title === raw) ||
      catalog.find((c) => formatCourseTypeLabel(c.type) === raw)
    if (match) {
      const fromSlug = SLUG_TO_LABEL[match.type] || SLUG_TO_LABEL[normalizeKey(match.type)]
      if (fromSlug && fromSlug !== COURSE_TYPE_OTHER) return fromSlug
      // כותרת קטלוג ארוכה — אם יש מיפוי לפי type עדיף; אחרת השתמש בכותרת
      return fromSlug || match.title || raw
    }
  }

  // כבר טקסט ידידותי / שם מותאם שנשמר ישירות
  return raw
}

export function formatLeadCourseType(
  lead: Pick<Lead, "courseType"> & { courseTypeOther?: string | null },
  catalog?: CourseCatalogItem[] | null,
): string {
  return formatCourseTypeLabel(lead.courseType, {
    other: lead.courseTypeOther,
    catalog,
  })
}

/** מוצא נכס קורס לפי מפתח, תווית או כותרת */
export function findCourseCatalog(
  courseType: string | null | undefined,
  catalog: CourseCatalogItem[],
): CourseCatalogItem | null {
  if (!courseType?.trim()) return null
  const raw = courseType.trim()
  const slug = LABEL_TO_SLUG[raw] || (SLUG_TO_LABEL[raw] ? raw : null)

  return (
    catalog.find((c) => c.type === raw) ||
    catalog.find((c) => c.title === raw) ||
    (slug ? catalog.find((c) => c.type === slug) : undefined) ||
    catalog.find((c) => formatCourseTypeLabel(c.type, { catalog }) === raw) ||
    catalog.find(
      (c) => formatCourseTypeLabel(c.type, { catalog }) === formatCourseTypeLabel(raw, { catalog }),
    ) ||
    null
  )
}

/**
 * רשימת אפשרויות ייחודיות לדרופדאון:
 * ברירות מחדל + קטלוג + ערכים שנשמרו בלידים
 */
export function collectCourseTypeOptions(
  leads: Array<Pick<Lead, "courseType"> & { courseTypeOther?: string | null }>,
  catalog?: CourseCatalogItem[] | null,
): string[] {
  const set = new Set<string>()

  for (const label of DEFAULT_COURSE_TYPE_LABELS) {
    set.add(label)
  }

  for (const c of catalog || []) {
    const label = formatCourseTypeLabel(c.type, { catalog })
    if (label && label !== COURSE_TYPE_OTHER) set.add(label)
  }

  for (const lead of leads) {
    const label = formatLeadCourseType(lead, catalog)
    if (label && label !== COURSE_TYPE_OTHER && label !== "קורס" && label !== "לא צוין") {
      set.add(label)
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, "he"))
}

/**
 * מפרק בחירת דרופדאון לשמירה ב-DB:
 * - תוויות מוכרות → סלג קנוני (לחיבור חוברות)
 * - אחר + טקסט חופשי → נשמר ישירות כ-courseType
 * - כותרת מותאמת קיימת → נשמרת כמו שהיא
 */
export function resolveCourseTypeForSave(
  selectedLabel: string,
  otherText?: string,
): { courseType: string; courseTypeOther?: string } {
  if (selectedLabel === COURSE_TYPE_OTHER || selectedLabel === "other") {
    const custom = otherText?.trim() || ""
    return {
      courseType: custom || COURSE_TYPE_OTHER,
      courseTypeOther: custom || undefined,
    }
  }

  const slug = LABEL_TO_SLUG[selectedLabel.trim()]
  if (slug) {
    return { courseType: slug, courseTypeOther: undefined }
  }

  // ערך מותאם שנבחר מהרשימה (כבר נשמר בעבר)
  return { courseType: selectedLabel.trim(), courseTypeOther: undefined }
}
