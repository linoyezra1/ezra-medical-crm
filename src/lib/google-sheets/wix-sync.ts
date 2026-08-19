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
 * סדר עמודות בגיליון Wix (A–L):
 * חותמת | שם מלא | תעודת זהות | תאריך קורס | מייל | טלפון |
 * הערות פנימיות / סוג קורס | שם מארגן הקורס | האם היית מרוצה מההדרכה |
 * תיק עזרה ראשונה | משוב על ההדרכה | trainingId
 */
const WIX_DEFAULT_COL = {
  fullName: 1,
  idNumber: 2,
  courseDate: 3,
  email: 4,
  phone: 5,
  courseType: 6,
  organizer: 7,
  satisfied: 8,
  buyKit: 9,
  feedback: 10,
  trainingId: 11,
} as const

type WixField = keyof typeof WIX_DEFAULT_COL

const WIX_HEADER_ALIASES: Record<WixField, string[]> = {
  fullName: ["שם מלא", "fullname", "full name"],
  idNumber: ["תעודת זהות", "תז", "ת.ז", "id number", "idnumber"],
  courseDate: ["תאריך קורס", "course date"],
  email: ["מייל", "אימייל", "email"],
  phone: ["טלפון", "phone"],
  courseType: ["הערותפניומיות סוג קורס", "הערות פנימיות", "סוג קורס", "הערות"],
  organizer: ["שם מארגן הקורס", "שם מארגן", "מארגן"],
  satisfied: ["האם היית מרוצה מההדרכה", "מרוצה", "שביעות רצון"],
  buyKit: ["תיק עזרה ראשונה", "תיק"],
  feedback: ["משוב על ההדרכה", "משוב"],
  trainingId: ["trainingid", "training id", "מזהה הדרכה"],
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function resolveWixColumns(headerRow: unknown[] | undefined): Record<WixField, number> {
  const cols: Record<WixField, number> = { ...WIX_DEFAULT_COL }
  if (!headerRow?.length) return cols

  const headers = headerRow.map((cell) => normalizeHeader(String(cell || "")))
  for (const field of Object.keys(WIX_HEADER_ALIASES) as WixField[]) {
    const aliases = WIX_HEADER_ALIASES[field]
    const idx = headers.findIndex((h) =>
      aliases.some((alias) => h === alias || h.includes(alias)),
    )
    if (idx >= 0) cols[field] = idx
  }
  return cols
}

function cell(row: unknown[], index: number): string {
  return String(row[index] ?? "").trim()
}

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
      range: `${tab}!A:L`,
    })
    const allRows = res.data.values || []
    if (allRows.length < 2) {
      return { ok: true, added: 0, skipped: 0 }
    }

    const cols = resolveWixColumns(allRows[0])
    const dataRows = allRows.slice(1)

    const wixRows = dataRows.filter(
      (row) => cell(row, cols.trainingId) === String(trainingId),
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
      const fullName = cell(row, cols.fullName)
      const idNumber = cell(row, cols.idNumber).replace(/[-\s]/g, "")
      const courseDate = cell(row, cols.courseDate) || null
      const email = cell(row, cols.email)
      const phone = cleanPhone(cell(row, cols.phone))
      const courseType = cell(row, cols.courseType) || null
      const organizerName = cell(row, cols.organizer) || null
      const satisfaction = cell(row, cols.satisfied) || null
      const kitInterest = cell(row, cols.buyKit) || null
      const feedback = cell(row, cols.feedback) || null

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
          courseDate,
          organizerName,
          courseType,
          satisfaction,
          kitInterest,
          feedback,
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
