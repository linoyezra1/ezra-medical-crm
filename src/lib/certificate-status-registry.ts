/**
 * מילון סטטוסי תעודות — מקור האמת ל-isCompleted (ללא ניחוש מילים).
 */

import { prisma } from "@/lib/db"
import {
  DEFAULT_CERT_STATUS,
  ISSUED_DIGITAL_CERT_STATUS,
  ISSUED_PHYSICAL_CERT_STATUS,
} from "@/lib/certificates-hub"

export type CertificateStatusCategory = "DIGITAL" | "PHYSICAL" | "BOTH"

export type CertificateStatusDefinition = {
  label: string
  type: CertificateStatusCategory
  isCompleted: boolean
}

/** סטטוסים ברירת מחדל — isCompleted מפורש */
export const DEFAULT_CERTIFICATE_STATUS_DEFINITIONS: CertificateStatusDefinition[] =
  [
    { label: DEFAULT_CERT_STATUS, type: "BOTH", isCompleted: false },
    { label: "נשלח ליוסי להפקה", type: "BOTH", isCompleted: false },
    { label: "נשלח לניתאי להפקה", type: "BOTH", isCompleted: false },
    {
      label: "הגיע במייל - ממתין לשליחה אישית",
      type: "DIGITAL",
      isCompleted: false,
    },
    {
      label: "הגיע במייל ממתין לשליחה",
      type: "DIGITAL",
      isCompleted: false,
    },
    { label: ISSUED_DIGITAL_CERT_STATUS, type: "DIGITAL", isCompleted: true },
    { label: "נשלח במייל", type: "DIGITAL", isCompleted: true },
    { label: "נשלח בווצאפ", type: "DIGITAL", isCompleted: true },
    { label: ISSUED_PHYSICAL_CERT_STATUS, type: "PHYSICAL", isCompleted: true },
    { label: "הודפס פיזית", type: "PHYSICAL", isCompleted: true },
  ]

export type ResolvedCertificateStatus = {
  label: string
  isCompleted: boolean
  known: boolean
}

/** מסנכרן ברירות מחדל + isCompleted לרשומות קיימות */
export async function ensureCertificateStatusRegistry(): Promise<void> {
  for (const def of DEFAULT_CERTIFICATE_STATUS_DEFINITIONS) {
    await prisma.certificateStatusOption.upsert({
      where: { label: def.label },
      create: {
        label: def.label,
        type: def.type,
        isCompleted: def.isCompleted,
      },
      update: {
        type: def.type,
        isCompleted: def.isCompleted,
      },
    })
  }
}

export async function loadCertificateStatusRegistry(): Promise<
  Map<string, { isCompleted: boolean; type: string }>
> {
  await ensureCertificateStatusRegistry()
  const rows = await prisma.certificateStatusOption.findMany()
  const map = new Map<string, { isCompleted: boolean; type: string }>()
  for (const r of rows) {
    map.set(r.label.trim(), {
      isCompleted: Boolean(r.isCompleted),
      type: r.type,
    })
  }
  return map
}

export function resolveCertificateStatusLabel(
  label: string,
  registry: Map<string, { isCompleted: boolean }>,
): ResolvedCertificateStatus {
  const trimmed = label.trim()
  if (!trimmed) {
    return {
      label: DEFAULT_CERT_STATUS,
      isCompleted: false,
      known: true,
    }
  }
  const hit = registry.get(trimmed)
  if (hit) {
    return { label: trimmed, isCompleted: hit.isCompleted, known: true }
  }
  return { label: trimmed, isCompleted: false, known: false }
}

function isPureTruthyToken(s: string): boolean {
  const lower = s.toLowerCase()
  return ["true", "yes", "1", "v", "✓", "כן"].includes(lower)
}

/** פענוח תא מגיליון (בוליאני / טקסט) — ברירת מחדל בטוחה: isCompleted=false */
export function parseSheetCertificateCell(
  raw: unknown,
  kind: "digital" | "physical",
  registry: Map<string, { isCompleted: boolean }>,
): ResolvedCertificateStatus | null {
  const s = String(raw ?? "").trim()
  if (!s) return null

  if (truthyCell(raw) && isPureTruthyToken(s)) {
    return {
      label:
        kind === "digital"
          ? ISSUED_DIGITAL_CERT_STATUS
          : ISSUED_PHYSICAL_CERT_STATUS,
      isCompleted: true,
      known: true,
    }
  }

  return resolveCertificateStatusLabel(s, registry)
}

export function truthyCell(value: unknown): boolean {
  if (value === true || value === 1) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return (
    s === "true" ||
    s === "yes" ||
    s === "1" ||
    s === "v" ||
    s === "✓" ||
    s === "כן"
  )
}

/** החלת סטטוס על דגלי trainee — רק מעלה ל-true, לא מאפס */
export function completionFlagsFromStatus(opts: {
  digital?: ResolvedCertificateStatus | null
  physical?: ResolvedCertificateStatus | null
}): {
  certificateEmailSent?: boolean
  certificateCardPrinted?: boolean
} {
  const out: {
    certificateEmailSent?: boolean
    certificateCardPrinted?: boolean
  } = {}
  if (opts.digital?.isCompleted) out.certificateEmailSent = true
  if (opts.physical?.isCompleted) out.certificateCardPrinted = true
  return out
}
