/**
 * מודול ניהול תעודות (Certificates Hub) — ניסיוני / מבודד.
 * לא משנה לוגיקת תעודות קיימת (certificateEmailSent וכו').
 */

import {
  displayCertifyingBody,
  normalizeCertifyingBody,
} from "@/lib/certifying-body"
import { formatCourseTypeLabel } from "@/lib/course-type"
import type { CertifyingBody } from "@/lib/types"

export const DEFAULT_CERT_STATUS = "ממתין לתעודה"

export const DEFAULT_CERT_STATUS_OPTIONS: {
  label: string
  type: "DIGITAL" | "PHYSICAL" | "BOTH"
}[] = [
  { label: "ממתין לתעודה", type: "BOTH" },
  { label: "נשלח ליוסי להפקה", type: "BOTH" },
  { label: "נשלח לניתאי להפקה", type: "BOTH" },
  { label: "הגיע במייל ממתין לשליחה", type: "DIGITAL" },
  { label: "נשלח במייל", type: "DIGITAL" },
  { label: "נשלח בווצאפ", type: "DIGITAL" },
  { label: "הודפס פיזית", type: "PHYSICAL" },
]

export type CertificatesHubTab = "ezra" | "nitai" | "yossi"

export const CERTIFICATES_HUB_TABS: {
  id: CertificatesHubTab
  label: string
}[] = [
  { id: "ezra", label: "עזרה ורפואה" },
  { id: "nitai", label: "ניתאי" },
  { id: "yossi", label: "יוסי עמר" },
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
  trainingTitle: string
  lastSessionDate: string
  certifyingBody: CertifyingBody | string
  courseSubtype: string
  digitalCertStatus: string
  physicalCertStatus: string
  batchId?: string
  batchName?: string
}

export function tabForCertifyingBody(
  body: string | null | undefined,
): CertificatesHubTab | null {
  const n = normalizeCertifyingBody(body)
  if (!n) return null
  if (n === "עזרה ורפואה") return "ezra"
  if (n.startsWith("ניתאי")) return "nitai"
  if (n.startsWith("יוסי")) return "yossi"
  return null
}

export function sectionKeyForRow(row: CertificatesHubRow): string {
  const tab = tabForCertifyingBody(row.certifyingBody)
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
  return formatCourseTypeLabel(raw, {
    other: opts.leadCourseTypeOther || undefined,
  }) || raw
}

export function resolveEffectiveCertifyingBody(opts: {
  participantBody?: string | null
  isExternal?: boolean
  leadDeliveryMethod?: string | null
}): string | undefined {
  return (
    displayCertifyingBody({
      certifyingBody: opts.participantBody,
      isExternal: opts.isExternal,
      leadCertificateDelivery: opts.leadDeliveryMethod,
    }) || undefined
  )
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
    rows: (map.get(section) || []).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, "he"),
    ),
  }))
}
