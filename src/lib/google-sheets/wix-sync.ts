import { prisma } from "@/lib/db"
import {
  getSheetsClient,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"
import { parseSheetDateValue } from "@/lib/google-sheets/sheet-dates"
import {
  cleanParticipantPhone,
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity"
import { upsertParticipantOnLead } from "@/lib/participant-upsert"
import { formatInJerusalem } from "@/lib/timezone"

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

/** נרמול תאריך מגיליון ל־YYYY-MM-DD לשמירה ב-CRM */
function normalizeCourseDateForDb(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const d = parseSheetDateValue(value)
  if (!d) return value.trim()
  return formatInJerusalem(d).date || value.trim()
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

    // וידוא שההדרכה קיימת
    const lead = await prisma.lead.findUnique({
      where: { id: trainingId },
      select: { id: true },
    })
    if (!lead) {
      return { ok: false, error: "ההדרכה לא נמצאה" }
    }

    let added = 0
    let skipped = 0
    let updated = 0

    for (const row of wixRows) {
      const fullName = cell(row, COL.fullName)
      const idNumber = normalizeParticipantIdNumber(cell(row, COL.idNumber))
      const courseDate = normalizeCourseDateForDb(cell(row, COL.courseDate))
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

      // בלי ת״ז תקינה — יצירה פשוטה (אין מפתח dedupe אמין)
      if (!isUsableParticipantIdNumber(idNumber)) {
        await prisma.participant.create({
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
        added++
        continue
      }

      const result = await upsertParticipantOnLead({
        leadId: trainingId,
        mergeMode: "preferIncoming",
        activityNote:
          "פרטי המשתתף עודכנו אוטומטית מרישום בקישור/Wix",
        data: {
          fullName: fullName || undefined,
          idNumber,
          phone: phone || undefined,
          email: email || undefined,
          courseDate: courseDate || undefined,
          organizerName: organizerName || undefined,
          courseType: courseType || undefined,
          satisfaction: satisfaction || undefined,
          kitInterest: kitInterest || undefined,
          feedback: feedback || undefined,
          source: "Wix",
        },
      })

      if (result.updated) updated++
      else if (result.created) added++
      else skipped++
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
