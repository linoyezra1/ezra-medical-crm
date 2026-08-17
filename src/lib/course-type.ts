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
  "8": "8_hours",
  "22": "22_hours",
  "44": "44_hours",
  "60": "60_hours",
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
  "8",
  "22",
  "44",
  "60",
  "רענון 8",
  "רענון 22",
  "רענון 44",
  "התנהלות בטוחה",
  "רענון עזרה ראשונה +התנהלות בטוחה",
  // תאימות לאחור לתצוגה / קטלוג קיים
  "22 שעות",
  "44 שעות",
  "60 שעות",
] as const

/**
 * אימות סוג קורס — רק:
 * מספר (22 / 44 / 8), «רענון N», «התנהלות בטוחה»,
 * או «רענון עזרה ראשונה +התנהלות בטוחה» (+ פורמטי שעות/סלג קיימים).
 */
export const COURSE_TYPE_FORMAT_ERROR =
  "פורמט סוג הקורס אינו תקין. נא להזין אחד מהפורמטים הבאים: מספר בלבד (למשל: 22), 'רענון' + מספר (למשל: רענון 22), 'התנהלות בטוחה', או 'רענון עזרה ראשונה +התנהלות בטוחה'."

export function isAllowedCourseTypeValue(raw: string): boolean {
  const v = raw.trim().replace(/\s+/g, " ")
  if (!v) return false
  if (/^\d+(\.\d+)?$/.test(v)) return true
  if (/^\d+(\.\d+)?\s*שעות$/.test(v)) return true
  if (/^\d+_hours$/i.test(v)) return true
  if (/^hours[_-]?\d+(\.\d+)?$/i.test(v)) return true
  if (/^רענון\s+\d+(\.\d+)?$/.test(v)) return true
  if (v === "התנהלות בטוחה") return true
  if (/^רענון עזרה ראשונה\s*\+\s*התנהלות בטוחה$/.test(v)) return true
  return false
}

/**
 * חילוץ ספרות היקף שעות בלבד מתוך סוג קורס (למשל «רענון 22» → «22»).
 * ללא ברירת מחדל קשיחה (לא 44).
 */
export function extractCourseHoursDigits(
  courseType?: string | null,
  courseTypeOther?: string | null,
): string {
  const label = formatCourseTypeLabel(courseType, { other: courseTypeOther })
  const sources = [label, (courseTypeOther || "").trim(), (courseType || "").trim()]

  for (const s of sources) {
    if (!s) continue
    const normalized = s.replace(/\s+/g, " ").trim()

    if (
      normalized === "התנהלות בטוחה" ||
      /^רענון עזרה ראשונה\s*\+\s*התנהלות בטוחה$/.test(normalized)
    ) {
      continue
    }

    const refresh = normalized.match(/רענון\s+(\d+(?:\.\d+)?)/)
    if (refresh?.[1]) return refresh[1]

    const hoursWord = normalized.match(/(\d+(?:\.\d+)?)\s*שעות/)
    if (hoursWord?.[1]) return hoursWord[1]

    if (/^\d+(\.\d+)?$/.test(normalized)) return normalized

    const slug =
      normalized.match(/(\d+(?:\.\d+)?)\s*[_-]?hours?/i) ||
      normalized.match(/hours[_-]?(\d+(?:\.\d+)?)/i)
    if (slug?.[1]) return slug[1]
  }

  const anyDigits = label.match(/(\d+(?:\.\d+)?)/)
  return anyDigits?.[1] || ""
}

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

/**
 * סוג קורס לתעודה / LMS:
 * משתתף חיצוני עם סוג אישי מוגדר → שלו; אחרת סוג ההדרכה.
 */
export function resolveParticipantCertificateCourseType(p: {
  isExternal?: boolean | null
  courseType?: string | null
  lead?: {
    courseType?: string | null
    courseTypeOther?: string | null
  } | null
}): { courseType: string | null; courseTypeOther: string | null } {
  const personal = p.courseType?.trim() || ""
  if (p.isExternal && personal) {
    return { courseType: personal, courseTypeOther: null }
  }
  return {
    courseType: p.lead?.courseType ?? null,
    courseTypeOther: p.lead?.courseTypeOther ?? null,
  }
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
