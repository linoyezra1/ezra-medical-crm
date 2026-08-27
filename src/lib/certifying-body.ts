/**
 * תעודות דרך מי — נרמול, ברירת מחדל וירושה מההדרכה.
 */

import {
  CERTIFYING_BODY_OPTIONS,
  DEFAULT_CERTIFYING_BODY,
  type CertifyingBody,
} from "@/lib/types"

const OPTION_SET = new Set<string>(CERTIFYING_BODY_OPTIONS)

/** ערכים ישנים ב-DB → האפשרויות החדשות */
const LEGACY_MAP: Record<string, CertifyingBody> = {
  ניתאי: "ניתאי עזרה ראשונה",
  יוסי: "יוסי רענון עזרה ראשונה+התנהלות בטוחה",
  "ניתאי עזרה ראשונה": "ניתאי עזרה ראשונה",
  "ניתאי התנהלות בטוחה": "ניתאי התנהלות בטוחה",
  "יוסי רענון עזרה ראשונה+התנהלות בטוחה":
    "יוסי רענון עזרה ראשונה+התנהלות בטוחה",
  "יוסי התנהלות בטוחה": "יוסי התנהלות בטוחה",
  "עזרה ורפואה": "עזרה ורפואה",
}

export function normalizeCertifyingBody(
  raw: string | null | undefined,
): CertifyingBody | undefined {
  const v = (raw || "").trim()
  if (!v) return undefined
  if (OPTION_SET.has(v)) return v as CertifyingBody
  if (LEGACY_MAP[v]) return LEGACY_MAP[v]
  return undefined
}

/** ברירת מחדל להדרכה / ליד */
export function resolveLeadCertifyingBody(
  raw: string | null | undefined,
): CertifyingBody {
  return normalizeCertifyingBody(raw) ?? DEFAULT_CERTIFYING_BODY
}

/**
 * ערך לשמירה בעת יצירת משתתף:
 * - חיצוני: רק אם נבחר במפורש (אחרת null)
 * - רגיל: יורש מההדרכה, או ברירת מחדל
 */
export function resolveParticipantCertifyingBodyOnCreate(opts: {
  isExternal: boolean
  explicit?: string | null
  leadDeliveryMethod?: string | null
}): string | null {
  const explicit = normalizeCertifyingBody(opts.explicit)
  if (opts.isExternal) {
    return explicit ?? null
  }
  return (
    explicit ??
    resolveLeadCertifyingBody(opts.leadDeliveryMethod)
  )
}

/** תצוגה: ערך שמור, או ירושה לתצוגה למשתתף רגיל בלי ערך */
export function displayCertifyingBody(opts: {
  certifyingBody?: string | null
  isExternal?: boolean
  leadCertificateDelivery?: string | null
}): string {
  const own = normalizeCertifyingBody(opts.certifyingBody)
  if (own) return own
  if (opts.isExternal) return ""
  return resolveLeadCertifyingBody(opts.leadCertificateDelivery)
}
