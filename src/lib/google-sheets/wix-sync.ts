import { prisma } from "@/lib/db"
import {
  getSheetsClient,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"
import {
  cleanParticipantPhone,
  findParticipantByIdNumber,
  indexParticipantsByIdNumber,
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity"

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
 * סדר עמודות קבוע בגיליון Wix — לפי אות העמודה, לא לפי חיפוש כותרת:
 * A חותמת | B שם מלא | C תעודת זהות | D תאריך קורס | E מייל | F טלפון |
 * G הערות / סוג קורס | H שם מארגן | I שביעות רצון | J תיק | K משוב | L trainingId
 */
const COL = {
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

function cell(row: unknown[], index: number): string {
  return String(row[index] ?? "").trim()
}

function isHeaderRow(row: unknown[]): boolean {
  const b = cell(row, COL.fullName).toLowerCase()
  const a = cell(row, 0).toLowerCase()
  const l = cell(row, COL.trainingId).toLowerCase()
  return (
    b === "שם מלא" ||
    b.includes("שם מלא") ||
    a.includes("חותמת") ||
    l === "trainingid" ||
    l === "training id"
  )
}

export type WixSyncResult = {
  ok: true
  added: number
  skipped: number
  updated: number
} | {
  ok: false
  error: string
}

type ExistingParticipant = Awaited<
  ReturnType<typeof prisma.participant.findMany>
>[number]

/**
 * התאמה להדרכה: ת״ז מנורמלת היא מפתח ייחודי.
 * בלי ת״ז בנתוני Wix — נפילה לטלפון/שם רק לתיקון ייבוא ישן.
 */
function findExistingForWixRow(
  existing: ExistingParticipant[],
  byId: Map<string, ExistingParticipant>,
  opts: { idNumber: string; phone: string; fullName: string },
): ExistingParticipant | undefined {
  if (isUsableParticipantIdNumber(opts.idNumber)) {
    return (
      byId.get(opts.idNumber) ??
      findParticipantByIdNumber(existing, opts.idNumber)
    )
  }

  const phone = opts.phone
  const fullName = opts.fullName.trim()

  return existing.find((p) => {
    const pid = normalizeParticipantIdNumber(p.idNumber)
    const pname = (p.fullName || "").trim()
    const pphone = cleanParticipantPhone(p.phone)

    if (phone && pphone === phone) return true
    if (fullName && pname === fullName) return true
    // ייבוא ישן שהוחלף: ת"ז=שם, טלפון=ת"ז, שם=תאריך
    if (fullName && pid === fullName) return true
    if (opts.idNumber && pphone === opts.idNumber) return true
    return false
  })
}

function rememberParticipant(
  existing: ExistingParticipant[],
  byId: Map<string, ExistingParticipant>,
  row: ExistingParticipant,
) {
  const idx = existing.findIndex((p) => p.id === row.id)
  if (idx >= 0) existing[idx] = row
  else existing.push(row)

  const id = normalizeParticipantIdNumber(row.idNumber)
  if (isUsableParticipantIdNumber(id)) {
    byId.set(id, row)
  }
}

/**
 * Reads Wix registration sheet rows, filters by trainingId,
 * upserts by ת״ז (unique per training) and tags with source="Wix".
 * מילוי חוזר / דיווח חוזר — מעדכן את הקיים, לא יוצר שורה חדשה.
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
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
    })
    const allRows = res.data.values || []
    if (!allRows.length) {
      return { ok: true, added: 0, skipped: 0, updated: 0 }
    }

    const dataRows = isHeaderRow(allRows[0]) ? allRows.slice(1) : allRows

    const trainingKey = String(trainingId).trim()
    const wixRows = dataRows.filter(
      (row) => cell(row, COL.trainingId) === trainingKey,
    )

    if (!wixRows.length) {
      return { ok: true, added: 0, skipped: 0, updated: 0 }
    }

    const existing = await prisma.participant.findMany({
      where: { leadId: trainingId },
    })
    const byId = indexParticipantsByIdNumber(existing)

    let added = 0
    let skipped = 0
    let updated = 0

    for (const row of wixRows) {
      const fullName = cell(row, COL.fullName)
      const idNumber = normalizeParticipantIdNumber(cell(row, COL.idNumber))
      const courseDate = cell(row, COL.courseDate) || null
      const email = cell(row, COL.email)
      const phone = cleanParticipantPhone(cell(row, COL.phone))
      const courseType = cell(row, COL.courseType) || null
      const organizerName = cell(row, COL.organizer) || null
      const satisfaction = cell(row, COL.satisfied) || null
      const kitInterest = cell(row, COL.buyKit) || null
      const feedback = cell(row, COL.feedback) || null

      if (!fullName && !idNumber && !phone) {
        skipped++
        continue
      }

      const match = findExistingForWixRow(existing, byId, {
        idNumber,
        phone,
        fullName,
      })

      if (match) {
        const nextIdNumber =
          idNumber ||
          normalizeParticipantIdNumber(match.idNumber) ||
          match.idNumber
        const data = {
          fullName: fullName || match.fullName,
          idNumber: nextIdNumber,
          phone: phone || match.phone,
          email: email || match.email,
          courseDate: courseDate || match.courseDate,
          organizerName: organizerName || match.organizerName,
          courseType: courseType || match.courseType,
          satisfaction: satisfaction || match.satisfaction,
          kitInterest: kitInterest || match.kitInterest,
          feedback: feedback || match.feedback,
          source: "Wix",
        }
        const saved = await prisma.participant.update({
          where: { id: match.id },
          data,
        })
        rememberParticipant(existing, byId, saved)
        updated++
        continue
      }

      // הגנה אחרונה: חיפוש מחדש ב-DB לפי ת״ז מנורמלת (מול רשומות עם פורמט ישן)
      if (isUsableParticipantIdNumber(idNumber)) {
        const fresh = await prisma.participant.findMany({
          where: { leadId: trainingId },
        })
        const dbMatch = findParticipantByIdNumber(fresh, idNumber)
        if (dbMatch) {
          const saved = await prisma.participant.update({
            where: { id: dbMatch.id },
            data: {
              fullName: fullName || dbMatch.fullName,
              idNumber,
              phone: phone || dbMatch.phone,
              email: email || dbMatch.email,
              courseDate: courseDate || dbMatch.courseDate,
              organizerName: organizerName || dbMatch.organizerName,
              courseType: courseType || dbMatch.courseType,
              satisfaction: satisfaction || dbMatch.satisfaction,
              kitInterest: kitInterest || dbMatch.kitInterest,
              feedback: feedback || dbMatch.feedback,
              source: "Wix",
            },
          })
          rememberParticipant(existing, byId, saved)
          updated++
          continue
        }
      }

      const created = await prisma.participant.create({
        data: {
          leadId: trainingId,
          fullName: fullName || "ללא שם",
          idNumber: idNumber || "",
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
      rememberParticipant(existing, byId, created)
      added++
    }

    return { ok: true, added, skipped, updated }
  } catch (err) {
    console.error("[refreshParticipantsFromWix]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בסנכרון מ-Wix",
    }
  }
}
