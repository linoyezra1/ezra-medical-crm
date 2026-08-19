import { prisma } from "@/lib/db"
import {
  getSheetsClient,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"

const DEFAULT_WIX_SPREADSHEET_ID =
  "1vy5gL9PjLQ8scNHvHPHxAtCLfWDRZm0Lr4BfdBK3Nz4"
const DEFAULT_WIX_TAB_NAME = "WIX"

function getWixSpreadsheetId(): string {
  return process.env.WIX_SPREADSHEET_ID?.trim() || DEFAULT_WIX_SPREADSHEET_ID
}

/**
 * Wix registration sheet tab name (separate from certificates tab).
 * Env var: WIX_SHEET_TAB_NAME, default "WIX"
 * Returned with single-quote wrapping for Google Sheets API compatibility.
 */
function getWixTabName(): string {
  const raw = process.env.WIX_SHEET_TAB_NAME?.trim() || DEFAULT_WIX_TAB_NAME
  return `'${raw.replace(/'/g, "")}'`
}

/**
 * Expected columns in the Wix registration sheet (A–L):
 *  A: שם מלא
 *  B: תעודת זהות
 *  C: טלפון
 *  D: אימייל
 *  E–K: (optional extra fields)
 *  L: trainingId (hidden value from dropdown)
 */
const WIX_COL = {
  fullName: 0,
  idNumber: 1,
  phone: 2,
  email: 3,
  trainingId: 11, // column L (0-indexed)
} as const

export type WixSyncResult = {
  ok: true
  added: number
  skipped: number
} | {
  ok: false
  error: string
}

/**
 * Reads Wix registration sheet rows, filters by trainingId,
 * adds new participants (deduped by idNumber or phone), and tags with source="Wix".
 */
export async function refreshParticipantsFromWix(
  trainingId: string,
): Promise<WixSyncResult> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: false, error: "Google Sheets לא מוגדר" }
  }

  try {
    const sheets = await getSheetsClient()
    const spreadsheetId = getWixSpreadsheetId()
    const tab = getWixTabName()

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A2:L`,
    })
    const allRows = res.data.values || []

    const wixRows = allRows.filter(
      (row) => String(row[WIX_COL.trainingId] || "").trim() === String(trainingId),
    )

    if (!wixRows.length) {
      return { ok: true, added: 0, skipped: 0 }
    }

    const existing = await prisma.participant.findMany({
      where: { leadId: trainingId },
      select: { idNumber: true, phone: true },
    })

    const existingIds = new Set(
      existing.map((p) => p.idNumber?.trim()).filter(Boolean),
    )
    const existingPhones = new Set(
      existing.map((p) => cleanPhone(p.phone)).filter(Boolean),
    )

    let added = 0
    let skipped = 0

    for (const row of wixRows) {
      const fullName = String(row[WIX_COL.fullName] || "").trim()
      const idNumber = String(row[WIX_COL.idNumber] || "").trim().replace(/[-\s]/g, "")
      const phone = cleanPhone(String(row[WIX_COL.phone] || ""))
      const email = String(row[WIX_COL.email] || "").trim()

      if (!fullName && !idNumber && !phone) {
        skipped++
        continue
      }

      const isDuplicate =
        (idNumber && existingIds.has(idNumber)) ||
        (phone && existingPhones.has(phone))

      if (isDuplicate) {
        skipped++
        continue
      }

      await prisma.participant.create({
        data: {
          leadId: trainingId,
          fullName,
          idNumber,
          phone: phone || null,
          email: email || null,
          source: "Wix",
        },
      })

      if (idNumber) existingIds.add(idNumber)
      if (phone) existingPhones.add(phone)
      added++
    }

    return { ok: true, added, skipped }
  } catch (err) {
    console.error("[refreshParticipantsFromWix]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בסנכרון מ-Wix",
    }
  }
}

function cleanPhone(raw: string | null | undefined): string {
  return (raw || "").replace(/[-\s().+]/g, "").trim()
}
