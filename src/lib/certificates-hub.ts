/**
 * מודול ניהול תעודות (Certificates Hub) — ניסיוני.
 * סטטוסי תעודה מסונכרנים עם certificateEmailSent / certificateCardPrinted (Sheets).
 */

import {
  normalizeCertifyingBody,
  resolveLeadCertifyingBody,
} from "@/lib/certifying-body"
import { formatCourseTypeLabel } from "@/lib/course-type"
import { formatLeadCategory } from "@/lib/helpers"
import { dbStatusToUi } from "@/lib/types"
import type { CertifyingBody, LeadStatus } from "@/lib/types"

export const DEFAULT_CERT_STATUS = "ממתין לתעודה"

/** סטטוס מוצג כש־Sheets/CRM סימנו הנפקה בלי סטטוס מותאם במודול */
export const ISSUED_DIGITAL_CERT_STATUS = "הונפקה תעודה"
export const ISSUED_PHYSICAL_CERT_STATUS = "הודפס פיזית"

/** חיצוניים ללא גוף מסמיך אישי */
export const UNASSIGNED_CERTIFYING_BODY = "ללא גוף מסמיך"

export type CertificatesHubTab = "ezra" | "nitai" | "yossi" | "unassigned"

export const CERTIFICATES_HUB_TABS: {
  id: CertificatesHubTab
  label: string
}[] = [
  { id: "ezra", label: "עזרה ורפואה" },
  { id: "nitai", label: "ניתאי" },
  { id: "yossi", label: "יוסי עמר" },
  { id: "unassigned", label: "ללא שיוך" },
]

/** גופי מסמיך מפורטים לפי טאב */
export const NITAI_SECTIONS = [
  "ניתאי עזרה ראשונה",
  "ניתאי התנהלות בטוחה",
] as const

export const YOSSI_SECTIONS = [
  "יוסי רענון עזרה ראשונה+התנהלות בטוחה",
  "יוסי התנהלות בטוחה",
] as const

export type CertificatesHubRow = {
  participantId: string
  traineeId?: string
  leadId: string
  fullName: string
  idNumber: string
  category: string
  trainingTitle: string
  lastSessionDate: string
  certifyingBody: CertifyingBody | string
  courseSubtype: string
  digitalCertStatus: string
  physicalCertStatus: string
  /** דגל סיום מסונכרן (Sheets / סימון ידני) — מקור האמת להסתרה מה-hub */
  digitalCompleted: boolean
  physicalCompleted: boolean
  batchId?: string
  batchName?: string
  isExternal?: boolean
  unassignedBody?: boolean
}

/** סטטוסי הדרכה שמאפשרים כניסה למודול תעודות */
export function isCertificatePhaseLeadStatus(
  dbOrUiStatus: string | LeadStatus | null | undefined,
): boolean {
  const ui = dbStatusToUi(String(dbOrUiStatus || ""))
  return ui === "pending_certificates" || ui === "completed"
}

/** הדרכה שעדיין פעילה / מתוזמנת — חוסמת זכאות עד סיום כל המחזורים */
export function isActivePreCertificateLeadStatus(
  dbOrUiStatus: string | LeadStatus | null | undefined,
): boolean {
  const ui = dbStatusToUi(String(dbOrUiStatus || ""))
  return ui === "new" || ui === "closed"
}

/**
 * חישוב סטטוס דיגיטלי לתצוגה — עדיפות לדגלים המסונכרנים מ־Sheets.
 * אם certificateEmailSent=true לא מחזירים «ממתין לתעודה».
 */
export function resolveDigitalCertStatus(opts: {
  storedStatus?: string | null
  certificateEmailSent?: boolean
}): string {
  const stored = (opts.storedStatus || "").trim()
  if (opts.certificateEmailSent) {
    if (stored && stored !== DEFAULT_CERT_STATUS) return stored
    return ISSUED_DIGITAL_CERT_STATUS
  }
  return stored || DEFAULT_CERT_STATUS
}

export function resolvePhysicalCertStatus(opts: {
  storedStatus?: string | null
  certificateCardPrinted?: boolean
}): string {
  const stored = (opts.storedStatus || "").trim()
  if (opts.certificateCardPrinted) {
    if (stored && stored !== DEFAULT_CERT_STATUS) return stored
    return ISSUED_PHYSICAL_CERT_STATUS
  }
  return stored || DEFAULT_CERT_STATUS
}

/** תעודה דיגיטלית הושלמה — רק לפי דגל (לא לפי טקסט סטטוס) */
export function isDigitalCertificateCompleted(opts: {
  certificateEmailSent?: boolean
}): boolean {
  return Boolean(opts.certificateEmailSent)
}

/** תעודה פיזית הושלמה — רק לפי דגל (לא לפי טקסט סטטוס) */
export function isPhysicalCertificateCompleted(opts: {
  certificateCardPrinted?: boolean
}): boolean {
  return Boolean(opts.certificateCardPrinted)
}

/**
 * זכאי לתצוגה ב־Certificates Hub רק אם נותרה עבודה פתוחה:
 * דיגיטלית ממתינה ו/או פיזית ממתינה — לא כששניהם הושלמו.
 */
export function hasPendingCertificateWork(opts: {
  digitalCertStatus?: string | null
  physicalCertStatus?: string | null
  certificateEmailSent?: boolean
  certificateCardPrinted?: boolean
}): boolean {
  const digitalDone = isDigitalCertificateCompleted({
    certificateEmailSent: opts.certificateEmailSent,
  })
  const physicalDone = isPhysicalCertificateCompleted({
    certificateCardPrinted: opts.certificateCardPrinted,
  })
  return !digitalDone || !physicalDone
}

/** @deprecated Hub updates use explicit markCompleted — kept for legacy callers */
export function digitalStatusImpliesIssued(_label: string): boolean | null {
  return null
}

/** @deprecated Hub updates use explicit markCompleted — kept for legacy callers */
export function physicalStatusImpliesIssued(_label: string): boolean | null {
  return null
}

export function tabForCertifyingBody(
  body: string | null | undefined,
): CertificatesHubTab | null {
  const raw = (body || "").trim()
  if (!raw || raw === UNASSIGNED_CERTIFYING_BODY) return "unassigned"
  const n = normalizeCertifyingBody(raw)
  if (!n) return "unassigned"
  if (n === "עזרה ורפואה") return "ezra"
  if (n.startsWith("ניתאי")) return "nitai"
  if (n.startsWith("יוסי")) return "yossi"
  return "unassigned"
}

export function sectionKeyForRow(row: CertificatesHubRow): string {
  const tab = tabForCertifyingBody(row.certifyingBody)
  if (tab === "unassigned") return UNASSIGNED_CERTIFYING_BODY
  if (tab === "nitai" || tab === "yossi") {
    return row.certifyingBody
  }
  return row.courseSubtype || "ללא סוג קורס"
}

export function resolveCourseSubtypeLabel(opts: {
  participantCourseType?: string | null
  leadCourseType?: string | null
  leadCourseTypeOther?: string | null
}): string {
  const raw =
    (opts.participantCourseType || "").trim() ||
    (opts.leadCourseTypeOther || "").trim() ||
    (opts.leadCourseType || "").trim()
  if (!raw) return "ללא סוג קורס"
  return (
    formatCourseTypeLabel(raw, {
      other: opts.leadCourseTypeOther || undefined,
    }) || raw
  )
}

/**
 * ניתוב לטאב תעודות:
 * - רגיל: גוף מסמיך של ההדרכה (deliveryMethod)
 * - חיצוני: רק certifyingBody אישי; בלי — ללא שיוך
 */
export function resolveHubRoutingBody(opts: {
  participantBody?: string | null
  isExternal?: boolean
  leadDeliveryMethod?: string | null
}): { body: string; unassigned: boolean } {
  if (opts.isExternal) {
    const own = normalizeCertifyingBody(opts.participantBody)
    if (!own) {
      return { body: UNASSIGNED_CERTIFYING_BODY, unassigned: true }
    }
    return { body: own, unassigned: false }
  }
  return {
    body: resolveLeadCertifyingBody(opts.leadDeliveryMethod),
    unassigned: false,
  }
}

/** @deprecated השתמשו ב־resolveHubRoutingBody */
export function resolveEffectiveCertifyingBody(opts: {
  participantBody?: string | null
  isExternal?: boolean
  leadDeliveryMethod?: string | null
}): string | undefined {
  const { body, unassigned } = resolveHubRoutingBody(opts)
  if (unassigned) return undefined
  return body
}

/** שם הדרכת מקור מה־CRM (שם לקוח / הדרכה) — לא organizerName מ־Wix */
export function resolveTrainingTitle(
  leadFullName?: string | null,
): string {
  return (leadFullName || "").trim() || "הדרכה"
}

/** רשימת הדרכות מקור מופרדת בפסיקים — תמיד לפי תאריך כרונולוגי */
export function formatTrainingTitlesList(
  entries: { title: string; dateKey?: string | null }[],
): string {
  const sorted = [...entries].sort((a, b) => {
    const da = (a.dateKey || "").trim().slice(0, 10)
    const db = (b.dateKey || "").trim().slice(0, 10)
    const aEmpty = !/^\d{4}-\d{2}-\d{2}$/.test(da)
    const bEmpty = !/^\d{4}-\d{2}-\d{2}$/.test(db)
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
    if (da !== db) return da.localeCompare(db)
    return a.title.localeCompare(b.title, "he")
  })

  const unique: string[] = []
  const seen = new Set<string>()
  for (const e of sorted) {
    const v = e.title.trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    unique.push(v)
  }
  return unique.join(", ") || "הדרכה"
}

export function resolveLastSessionDate(opts: {
  courseDate?: string | null
  leadDate?: string | null
}): string {
  const a = (opts.courseDate || "").trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a
  const b = (opts.leadDate || "").trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(b)) return b
  return ""
}

export function formatCertDateDisplay(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "—"
  const [y, m, d] = isoDate.split("-")
  return `${d}/${m}/${y}`
}

/** קטגוריה לתצוגה — חיצוני: courseCategory אישי; אחרת מההדרכה */
export function resolveHubCategoryLabel(opts: {
  isExternal?: boolean
  participantCategory?: string | null
  leadCategory?: string | null
  leadCategoryOther?: string | null
}): string {
  const raw =
    (opts.isExternal && opts.participantCategory?.trim()
      ? opts.participantCategory.trim()
      : "") ||
    opts.leadCategoryOther?.trim() ||
    opts.leadCategory?.trim() ||
    opts.participantCategory?.trim() ||
    ""
  if (!raw) return "—"
  const label = formatLeadCategory(raw)
  return label === "—" ? raw : label
}

/** מיון שורות: הדרכת מקור (א-ת) ואז תאריך מפגש אחרון (ישן → חדש) */
export function sortCertificatesHubRows(
  rows: CertificatesHubRow[],
): CertificatesHubRow[] {
  return [...rows].sort((a, b) => {
    const byTitle = a.trainingTitle.localeCompare(b.trainingTitle, "he")
    if (byTitle !== 0) return byTitle
    const da = a.lastSessionDate || "9999-99-99"
    const db = b.lastSessionDate || "9999-99-99"
    return da.localeCompare(db)
  })
}

/** פיצול שם מלא לייצוא אקסל: מילה ראשונה = פרטי, השאר = משפחה */
export function splitFullNameForExport(fullName: string): {
  firstName: string
  lastName: string
} {
  const trimmed = (fullName || "").trim()
  if (!trimmed) return { firstName: "", lastName: "" }
  const spaceIdx = trimmed.indexOf(" ")
  if (spaceIdx === -1) return { firstName: trimmed, lastName: "" }
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1).trim(),
  }
}

export function groupRowsBySection(
  rows: CertificatesHubRow[],
  tab: CertificatesHubTab,
): { section: string; rows: CertificatesHubRow[] }[] {
  const map = new Map<string, CertificatesHubRow[]>()
  for (const row of rows) {
    if (tabForCertifyingBody(row.certifyingBody) !== tab) continue
    const key = sectionKeyForRow(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }

  const preferredOrder: string[] =
    tab === "nitai"
      ? [...NITAI_SECTIONS]
      : tab === "yossi"
        ? [...YOSSI_SECTIONS]
        : []

  const keys = [...map.keys()].sort((a, b) => {
    const ia = preferredOrder.indexOf(a)
    const ib = preferredOrder.indexOf(b)
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1
      if (ib < 0) return -1
      return ia - ib
    }
    return a.localeCompare(b, "he")
  })

  return keys.map((section) => ({
    section,
    rows: sortCertificatesHubRows(map.get(section) || []),
  }))
}
