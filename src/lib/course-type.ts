import type { CourseCatalogItem, Lead } from "@/lib/types"

export const COURSE_TYPE_OTHER = "אחר"

/** מיפוי מפתחות פנימיים / סלגים → תווית תצוגה */
const SLUG_TO_LABEL: Record<string, string> = {
  "8_hours": "8 שעות",
  "hours-8": "8 שעות",
  "hours_8": "8 שעות",
  "8-hours": "8 שעות",
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
  "8 שעות": "8_hours",
  חובשים: "paramedic",
  חובש: "paramedic",
  "החייאת תינוקות": "infant_cpr",
  "החייאת תינוקות (גן)": "infant_kindergarten",
}

/** תוויות ברירת מחדל — ריק; סוגים חדשים נוספים דרך «אחר» */
export const DEFAULT_COURSE_TYPE_LABELS: readonly string[] = []

/**
 * אימות סוג קורס — רק:
 * מספר (22 / 44 / 8), «רענון N», «התנהלות בטוחה»,
 * או «רענון עזרה ראשונה +התנהלות בטוחה» (+ פורמטי שעות/סלג קיימים).
 */
export const COURSE_TYPE_FORMAT_ERROR =
  "פורמט סוג הקורס אינו תקין. נא להזין אחד מהפורמטים הבאים: מספר בלבד (למשל: 22), 'רענון' + מספר (למשל: רענון 22), 'BLS', 'התנהלות בטוחה', או 'רענון עזרה ראשונה +התנהלות בטוחה'."

export function isAllowedCourseTypeValue(raw: string): boolean {
  const v = raw.trim().replace(/\s+/g, " ")
  if (!v) return false
  if (/^\d+(\.\d+)?$/.test(v)) return true
  if (/^\d+(\.\d+)?\s*שעות$/.test(v)) return true
  if (/^\d+_hours$/i.test(v)) return true
  if (/^hours[_-]?\d+(\.\d+)?$/i.test(v)) return true
  if (/^רענון\s+\d+(\.\d+)?$/.test(v)) return true
  if (/^BLS$/i.test(v)) return true
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

/** סוג קורס מעון: רענון עזרה ראשונה + התנהלות בטוחה */
export const KINDERGARTEN_REFRESH_COURSE_LABEL =
  "רענון עזרה ראשונה+התנהלות בטוחה"

/** האם סוג הקורס הוא (או מכיל) רענון עזרה ראשונה + התנהלות בטוחה */
export function isKindergartenRefreshCourseType(
  courseType?: string | null,
  courseTypeOther?: string | null,
): boolean {
  const sources = [
    formatCourseTypeLabel(courseType, { other: courseTypeOther }),
    (courseTypeOther || "").trim(),
    (courseType || "").trim(),
  ]
  return sources.some((s) => {
    const n = s.replace(/\s+/g, " ").trim()
    if (!n) return false
    if (/^רענון עזרה ראשונה\s*\+\s*התנהלות בטוחה$/.test(n)) return true
    return n.includes("רענון עזרה ראשונה") && n.includes("התנהלות בטוחה")
  })
}

/** האם סוג הקורס הוא רענון (לתעודה / תבנית PDF) */
export function isRefreshCourseType(
  courseType?: string | null,
  courseTypeOther?: string | null,
): boolean {
  const sources = [
    formatCourseTypeLabel(courseType, { other: courseTypeOther }),
    (courseTypeOther || "").trim(),
    (courseType || "").trim(),
  ]
  return sources.some((s) => s.includes("רענון"))
}

/** האם סוג הקורס הוא BLS (לתעודה / תבנית PDF) */
export function isBlsCourseType(
  courseType?: string | null,
  courseTypeOther?: string | null,
): boolean {
  const sources = [
    formatCourseTypeLabel(courseType, { other: courseTypeOther }),
    (courseTypeOther || "").trim(),
    (courseType || "").trim(),
  ]
  return sources.some((s) => /^BLS$/i.test(s.replace(/\s+/g, " ").trim()))
}

/**
 * ערך עמודה F בגיליון תעודות — מודפס ב-PDF.
 * כשיש «רענון» בסוג הקורס: «רענון 22» · אחרת ספרות בלבד «22».
 */
export function certificateScopeForSheet(
  courseType?: string | null,
  courseTypeOther?: string | null,
): string {
  const sources = [
    formatCourseTypeLabel(courseType, { other: courseTypeOther }),
    (courseTypeOther || "").trim(),
    (courseType || "").trim(),
  ]

  for (const s of sources) {
    if (!s) continue
    const normalized = s.replace(/\s+/g, " ").trim()
    if (/^BLS$/i.test(normalized)) return "BLS"
    if (!normalized.includes("רענון")) continue

    const refreshNum = normalized.match(/רענון\s+(\d+(?:\.\d+)?)/)
    if (refreshNum?.[1]) return `רענון ${refreshNum[1]}`

    const digits = extractCourseHoursDigits(courseType, courseTypeOther)
    if (digits) return `רענון ${digits}`

    return normalized
  }

  return extractCourseHoursDigits(courseType, courseTypeOther)
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

  const hoursFromSlug =
    raw.match(/^(\d+(?:\.\d+)?)[_-]hours$/i) ||
    raw.match(/^hours[_-](\d+(?:\.\d+)?)$/i)
  if (hoursFromSlug?.[1]) return `${hoursFromSlug[1]} שעות`

  const hoursFromNorm = normalizeKey(raw).match(/^(\d+(?:\.\d+)?)_hours$/)
  if (hoursFromNorm?.[1]) return `${hoursFromNorm[1]} שעות`

  // כבר טקסט ידידותי / שם מותאם שנשמר ישירות
  return raw
}

export function formatLeadCourseType(
  lead: Pick<Lead, "courseType"> & {
    courseTypeOther?: string | null
    isPrivateCourse?: boolean
  },
  catalog?: CourseCatalogItem[] | null,
): string {
  if (lead.isPrivateCourse) return "קורס פרטי"
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
 * סוגים מותאמים שנשמרו (דרך «אחר») + קטלוג שאינו ברירת מחדל.
 * לא מזריקים יותר רשימת סוגים קבועה.
 */
export function collectCourseTypeOptions(
  leads: Array<Pick<Lead, "courseType"> & { courseTypeOther?: string | null }>,
  catalog?: CourseCatalogItem[] | null,
): string[] {
  const set = new Set<string>()

  for (const c of catalog || []) {
    if (isSeededCourseSlug(c.type)) continue
    const label = formatCourseTypeLabel(c.type, { catalog })
    if (label && label !== COURSE_TYPE_OTHER) set.add(label)
  }

  for (const lead of leads) {
    const raw = (lead.courseType || "").trim()
    if (isSeededCourseSlug(raw) || raw === "other" || raw === COURSE_TYPE_OTHER) {
      const other = (lead.courseTypeOther || "").trim()
      if (other && !isSeededCourseSlug(other)) set.add(other)
      continue
    }
    const label = formatLeadCourseType(lead, catalog)
    if (
      label &&
      label !== COURSE_TYPE_OTHER &&
      label !== "קורס" &&
      label !== "לא צוין"
    ) {
      set.add(label)
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, "he"))
}

function isSeededCourseSlug(raw: string): boolean {
  const v = raw.trim()
  if (!v) return false
  return Boolean(SLUG_TO_LABEL[v] || SLUG_TO_LABEL[v.toLowerCase()])
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
