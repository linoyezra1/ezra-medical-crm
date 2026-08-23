import { prisma } from "@/lib/db"
import {
  certificateScopeForSheet,
  resolveParticipantCertificateCourseType,
} from "@/lib/course-type"
import { isTrainingFullySettled } from "@/lib/training-profit"
import {
  getSheetTabName,
  getSheetsClient,
  getSpreadsheetId,
  isGoogleSheetsConfigured,
  sheetA1,
} from "@/lib/google-sheets/client"
import {
  formatSheetDateDdMmYyyy,
  formatSheetDateTimeDdMmYyyy,
} from "@/lib/google-sheets/sheet-dates"

/**
 * כותרות עמודות בגיליון «תעודות» — 19 עמודות בסדר קבוע (A–S)
 * G–H / N ממולאים בגיליון או ע״י Apps Script
 * O = נוכחות (TRUE / לא נכח)
 * P–S = כתובת מגורים של המודרך
 */
export const CERTIFICATE_SHEET_HEADERS = [
  "שם מלא", // A
  "תעודת זהות", // B
  "תאריך הדרכה", // C
  "אימייל", // D
  "טלפון", // E
  "היקף שעות", // F
  "מספר תעודה", // G — מילוי בגיליון
  "תוקף תעודה", // H — מילוי בגיליון
  "הודפס כרטיס", // I
  "נשלח במייל", // J
  "שם מזמין", // K
  "תאריך ייצוא", // L
  "מזהה משתתף (ID)", // M — CRM_PARTICIPANT_ID
  "קישור PDF לתעודה", // N — certificateUrl
  "נוכחות", // O — attended
  "עיר", // P
  "כתובת / רחוב", // Q
  "מספר בית", // R
  "מיקוד", // S
] as const

/** אינדקסים 0-based לפי מבנה הגיליון */
const COL = {
  fullName: 0, // A
  idNumber: 1, // B
  courseDate: 2, // C
  email: 3, // D
  phone: 4, // E
  hours: 5, // F
  certificateNumber: 6, // G — מספר תעודה
  certificateExpiry: 7, // H — תוקף תעודה
  cardPrinted: 8, // I — הודפס כרטיס
  emailSent: 9, // J — נשלח במייל
  organizer: 10, // K
  exportTimestamp: 11, // L
  crmId: 12, // M — CRM_PARTICIPANT_ID
  pdfUrl: 13, // N — קישור PDF
  attended: 14, // O — נוכחות
  city: 15, // P
  street: 16, // Q
  houseNumber: 17, // R
  zipCode: 18, // S
} as const

const SHEET_RANGE_HEADER = "A1:S1"
const SHEET_RANGE_DATA = "A2:S"
const SHEET_RANGE_APPEND = "A:S"
/** עמודת מזהה משתתף למניעת כפילויות */
const SHEET_RANGE_CRM_IDS = "M:M"
/** כותרות כתובת בלבד (הרחבה לגיליונות ישנים A–O) */
const LEGACY_HEADER_COLS = 15

function truthyCell(value: unknown): boolean {
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
    s === "כן" ||
    s === "TRUE"
  )
}

async function ensureHeaderRow() {
  const sheets = await getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const tab = getSheetTabName()
  const range = sheetA1(tab, SHEET_RANGE_HEADER)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })
  const row = existing.data.values?.[0] || []
  if (row.length >= CERTIFICATE_SHEET_HEADERS.length) return

  // גיליון ישן A–O — מוסיפים רק כותרות P–S בלי לדרוס A–O
  if (row.length >= LEGACY_HEADER_COLS) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, "P1:S1"),
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[...CERTIFICATE_SHEET_HEADERS.slice(LEGACY_HEADER_COLS)]],
      },
    })
    return
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[...CERTIFICATE_SHEET_HEADERS]] },
  })
}

function sheetText(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : ""
}

/** תאי כתובת מגורים — P עיר | Q רחוב | R מספר בית | S מיקוד */
function addressCells(p: {
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingHouseNo?: string | null
  shippingZip?: string | null
}): string[] {
  return [
    sheetText(p.shippingCity),
    sheetText(p.shippingStreet),
    sheetText(p.shippingHouseNo),
    sheetText(p.shippingZip),
  ]
}

/** תאריך הדרכה לגיליון — תמיד מחרוזת DD/MM/YYYY (לא epoch / ISO) */
function trainingDateLabel(
  courseDate: string | null | undefined,
  scheduledStart: Date | null | undefined,
): string {
  if (courseDate?.trim()) {
    return formatSheetDateDdMmYyyy(courseDate.trim()) || courseDate.trim()
  }
  if (scheduledStart) {
    return formatSheetDateDdMmYyyy(scheduledStart)
  }
  return ""
}

/** היקף שעות לגיליון / PDF — רענון כולל את המילה «רענון» */
function hoursScopeForSheet(
  courseType?: string | null,
  courseTypeOther?: string | null,
): string {
  return certificateScopeForSheet(courseType, courseTypeOther)
}

function attendanceCell(attended: boolean): string {
  return attended ? "TRUE" : "לא נכח"
}

function isNonAttendedCell(value: unknown): boolean {
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return s === "לא נכח" || s === "false" || s === "no" || s === "0"
}

function participantRow(p: {
  id: string
  fullName: string
  idNumber: string
  phone: string | null
  email: string | null
  organizerName: string | null
  courseDate: string | null
  attended?: boolean | null
  isExternal?: boolean | null
  courseType?: string | null
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingHouseNo?: string | null
  shippingZip?: string | null
  trainee?: {
    certificateEmailSent: boolean
    certificateCardPrinted: boolean
  } | null
  lead?: {
    fullName: string
    scheduledStart: Date | null
    courseType: string | null
    courseTypeOther: string | null
  } | null
}): (string | boolean)[] {
  const courseDate = trainingDateLabel(p.courseDate, p.lead?.scheduledStart)
  const certCourse = resolveParticipantCertificateCourseType(p)
  const hoursScope = hoursScopeForSheet(
    certCourse.courseType,
    certCourse.courseTypeOther,
  )
  const exportTimestamp = formatSheetDateTimeDdMmYyyy(new Date())

  // I/J מתחילים ריקים — ממולאים בגיליון; סנכרון קורא משם חזרה ל-CRM
  return [
    p.fullName || "", // A
    p.idNumber || "", // B
    courseDate, // C — DD/MM/YYYY
    p.email || "", // D
    p.phone || "", // E
    hoursScope, // F — «22» או «רענון 22» לפי סוג הקורס
    "", // G — מספר תעודה (מילוי בגיליון)
    "", // H — תוקף תעודה (מילוי בגיליון)
    "", // I — הודפס כרטיס (מילוי בגיליון)
    "", // J — נשלח במייל (מילוי בגיליון)
    p.organizerName || p.lead?.fullName || "", // K
    exportTimestamp, // L — DD/MM/YYYY HH:mm
    p.id, // M — CRM_PARTICIPANT_ID
    "", // N — קישור PDF (מילוי בגיליון / Apps Script)
    attendanceCell(Boolean(p.attended)), // O — נוכחות
    ...addressCells(p), // P–S עיר / רחוב / מספר בית / מיקוד
  ]
}

function crmIdRowMap(
  columnM: unknown[][] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < (columnM || []).length; i++) {
    const id = String(columnM?.[i]?.[0] || "").trim()
    if (
      !id ||
      id.includes("מזהה משתתף") ||
      id === "CRM_PARTICIPANT_ID"
    ) {
      continue
    }
    if (!map.has(id)) map.set(id, i + 1)
  }
  return map
}

/** ייצוא נוכחים לגיליון + עדכון עמודת נוכחות לשורות קיימות */
export async function exportLeadParticipantsToSheets(
  leadId: string,
): Promise<
  | { ok: true; exported: number; attendanceUpdated: number }
  | { ok: false; error: string }
> {
  if (!isGoogleSheetsConfigured()) {
    return {
      ok: false,
      error: "Google Sheets לא מוגדר (חסרים משתני סביבה)",
    }
  }

  try {
    await ensureHeaderRow()
    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()

    const participants = await prisma.participant.findMany({
      where: { leadId },
      include: {
        trainee: {
          select: {
            certificateEmailSent: true,
            certificateCardPrinted: true,
          },
        },
        lead: {
          select: {
            fullName: true,
            scheduledStart: true,
            courseType: true,
            courseTypeOther: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    if (!participants.length) {
      return { ok: true, exported: 0, attendanceUpdated: 0 }
    }

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_CRM_IDS),
    })
    const rowById = crmIdRowMap(existing.data.values)

    const rowIndexFor = (p: { id: string; traineeId: string | null }) =>
      rowById.get(p.id) || (p.traineeId ? rowById.get(p.traineeId) : undefined)

    const attendanceUpdates: { range: string; values: string[][] }[] = []
    const addressUpdates: { range: string; values: string[][] }[] = []
    for (const p of participants) {
      const rowIndex = rowIndexFor(p)
      if (!rowIndex) continue
      attendanceUpdates.push({
        range: sheetA1(tab, `O${rowIndex}`),
        values: [[attendanceCell(Boolean(p.attended))]],
      })
      addressUpdates.push({
        range: sheetA1(tab, `P${rowIndex}:S${rowIndex}`),
        values: [addressCells(p)],
      })
    }
    const sheetUpdates = [...attendanceUpdates, ...addressUpdates]
    if (sheetUpdates.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: sheetUpdates,
        },
      })
    }

    // כל מי שעדיין לא בגיליון (גם נרשם חדש שטרם סומן נוכחות)
    const toExport = participants.filter((p) => !rowIndexFor(p))
    if (toExport.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: sheetA1(tab, SHEET_RANGE_APPEND),
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: toExport.map((p) => participantRow(p)) },
      })

      const now = new Date()
      await prisma.participant.updateMany({
        where: { id: { in: toExport.map((p) => p.id) } },
        data: { sheetsExportedAt: now },
      })
    }

    return {
      ok: true,
      exported: toExport.length,
      attendanceUpdated: attendanceUpdates.length,
    }
  } catch (err) {
    console.error("[exportLeadParticipantsToSheets]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בייצוא ל-Google Sheets",
    }
  }
}

/**
 * עדכון נוכחות בגיליון (עמודה O) לפי CRM ID בעמודה M.
 * אם הנוכח עדיין לא בגיליון — לא יוצר שורה (הייצוא המלא עושה זאת).
 */
export async function setAttendanceInSheets(
  participantId: string,
  attended: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isGoogleSheetsConfigured()) return { ok: true }
  try {
    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, "M:M"),
    })
    const rowIndex = crmIdRowMap(res.data.values).get(participantId)
    if (!rowIndex) return { ok: true }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, `O${rowIndex}`),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[attendanceCell(attended)]] },
    })
    return { ok: true }
  } catch (err) {
    console.error("[setAttendanceInSheets]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בעדכון גיליון",
    }
  }
}

/** תאימות לשם הישן */
export async function markNonAttendedInSheets(
  participantId: string,
): Promise<{ ok: boolean; error?: string }> {
  return setAttendanceInSheets(participantId, false)
}

/** עדכון O, ואם נוכח ועדיין לא בגיליון — מוסיף שורה */
export async function syncParticipantAttendanceToSheets(
  participantId: string,
  attended: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isGoogleSheetsConfigured()) return { ok: true }
  try {
    await ensureHeaderRow()
    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()

    const p = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        trainee: {
          select: {
            certificateEmailSent: true,
            certificateCardPrinted: true,
          },
        },
        lead: {
          select: {
            fullName: true,
            scheduledStart: true,
            courseType: true,
            courseTypeOther: true,
          },
        },
      },
    })
    if (!p) return { ok: true }

    const colM = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, "M:M"),
    })
    const rowById = crmIdRowMap(colM.data.values)
    const rowIndex =
      rowById.get(participantId) ||
      (p.traineeId ? rowById.get(p.traineeId) : undefined)
    if (rowIndex) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: sheetA1(tab, `O${rowIndex}`),
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[attendanceCell(attended)]] },
      })
      return { ok: true }
    }

    if (!attended) return { ok: true }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_APPEND),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [participantRow({ ...p, attended: true })] },
    })
    await prisma.participant.update({
      where: { id: participantId },
      data: { sheetsExportedAt: new Date() },
    })
    return { ok: true }
  } catch (err) {
    console.error("[syncParticipantAttendanceToSheets]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בעדכון גיליון",
    }
  }
}

async function fetchExistingCrmIdsInSheet(): Promise<Set<string>> {
  const sheets = await getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const tab = getSheetTabName()
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetA1(tab, SHEET_RANGE_CRM_IDS),
  })
  return new Set(
    (existing.data.values || [])
      .flat()
      .map((v) => String(v || "").trim())
      .filter(
        (v) =>
          v &&
          !v.includes("מזהה משתתף") &&
          v !== "CRM_PARTICIPANT_ID",
      ),
  )
}

/**
 * ייצוא מודרכים לגיליון תעודות — גם ללא שיוך להדרכה.
 * בעמודה M נשמר מזהה המודרך (trainee.id) כמפתח לחיפוש בסקריפט.
 */
export async function exportTraineesToCertificateSheet(
  traineeIds: string[],
): Promise<{ ok: true; exported: number } | { ok: false; error: string }> {
  if (!isGoogleSheetsConfigured()) {
    return {
      ok: false,
      error: "Google Sheets לא מוגדר (חסרים משתני סביבה)",
    }
  }

  const ids = [...new Set(traineeIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { ok: true, exported: 0 }

  try {
    await ensureHeaderRow()
    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()

    const trainees = await prisma.trainee.findMany({
      where: { id: { in: ids } },
      include: {
        participants: {
          orderBy: { createdAt: "desc" },
          include: {
            lead: {
              select: {
                fullName: true,
                scheduledStart: true,
                courseType: true,
                courseTypeOther: true,
              },
            },
          },
        },
      },
    })

    if (!trainees.length) return { ok: true, exported: 0 }

    const existingIds = await fetchExistingCrmIdsInSheet()
    const toExport = trainees.filter(
      (t) =>
        !existingIds.has(t.id) &&
        !t.participants.some((p) => existingIds.has(p.id)),
    )
    if (!toExport.length) return { ok: true, exported: 0 }

    const values = toExport.map((t) => {
      const p = t.participants[0]
      const lead = p?.lead
      const certCourse = resolveParticipantCertificateCourseType({
        isExternal: p?.isExternal,
        courseType: p?.courseType,
        lead,
      })
      return [
        t.fullName || "",
        t.idNumber || "",
        trainingDateLabel(p?.courseDate, lead?.scheduledStart),
        t.email || "",
        t.phone || "",
        hoursScopeForSheet(certCourse.courseType, certCourse.courseTypeOther),
        "",
        "",
        "",
        "",
        p?.organizerName || lead?.fullName || "",
        formatSheetDateTimeDdMmYyyy(new Date()),
        p?.id || t.id, // M — מזהה משתתף אם יש, אחרת מודרך
        "", // N — קישור PDF
        "TRUE", // O — נוכחות
        ...addressCells(p || {}), // P–S
      ]
    })

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_APPEND),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })

    return { ok: true, exported: toExport.length }
  } catch (err) {
    console.error("[exportTraineesToCertificateSheet]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בייצוא מודרכים ל-Google Sheets",
    }
  }
}

/** מוסיף לגיליון נוכחים שעדיין לא יוצאו (למשל מסך מודרכים) */
export async function exportMissingAttendedToSheets(): Promise<
  { ok: true; exported: number } | { ok: false; error: string }
> {
  if (!isGoogleSheetsConfigured()) {
    return {
      ok: false,
      error: "Google Sheets לא מוגדר (חסרים משתני סביבה)",
    }
  }
  try {
    await ensureHeaderRow()
    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()

    const participants = await prisma.participant.findMany({
      where: { attended: true },
      include: {
        trainee: {
          select: {
            certificateEmailSent: true,
            certificateCardPrinted: true,
          },
        },
        lead: {
          select: {
            fullName: true,
            scheduledStart: true,
            courseType: true,
            courseTypeOther: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })
    if (!participants.length) return { ok: true, exported: 0 }

    const existingIds = await fetchExistingCrmIdsInSheet()
    const toExport = participants.filter(
      (p) =>
        !existingIds.has(p.id) &&
        !(p.traineeId && existingIds.has(p.traineeId)),
    )
    if (!toExport.length) return { ok: true, exported: 0 }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_APPEND),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: toExport.map((p) => participantRow(p)) },
    })
    await prisma.participant.updateMany({
      where: { id: { in: toExport.map((p) => p.id) } },
      data: { sheetsExportedAt: new Date() },
    })
    return { ok: true, exported: toExport.length }
  } catch (err) {
    console.error("[exportMissingAttendedToSheets]", err)
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "שגיאה בייצוא מודרכים חסרים לגיליון",
    }
  }
}

/**
 * מעדכן היקף שעות (עמודה F) בגיליון לפי סוג הקורס האישי של משתתף חיצוני.
 * נדרש כי ייצוא ראשוני עלול לדלג על שורות שכבר קיימות.
 */
export async function syncCertificateHoursForParticipantIds(
  participantIds: string[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: true, updated: 0 }
  }
  const ids = [...new Set(participantIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { ok: true, updated: 0 }

  try {
    const rows = await prisma.participant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        isExternal: true,
        courseType: true,
        lead: {
          select: {
            courseType: true,
            courseTypeOther: true,
          },
        },
      },
    })
    const hoursById = new Map(
      rows.map((p) => {
        const cert = resolveParticipantCertificateCourseType(p)
        return [p.id, hoursScopeForSheet(cert.courseType, cert.courseTypeOther)]
      }),
    )

    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_DATA),
    })
    const data = existing.data.values || []
    const updates: { range: string; values: string[][] }[] = []
    data.forEach((row, i) => {
      const crmId = String(row[COL.crmId] || "").trim()
      const hours = hoursById.get(crmId)
      if (hours == null) return
      const current = String(row[COL.hours] || "").trim()
      if (current === hours) return
      updates.push({
        range: sheetA1(tab, `F${i + 2}`),
        values: [[hours]],
      })
    })
    if (!updates.length) return { ok: true, updated: 0 }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates,
      },
    })
    return { ok: true, updated: updates.length }
  } catch (err) {
    console.error("[syncCertificateHoursForParticipantIds]", err)
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "שגיאה בעדכון היקף שעות בגיליון",
    }
  }
}

/** סנכרון דגלים מגיליון → CRM (מייל / כרטיס) */
export async function syncCertificateFlagsFromSheets(): Promise<{
  ok: true
  updated: number
  autoCompleted: number
} | { ok: false; error: string }> {
  if (!isGoogleSheetsConfigured()) {
    return {
      ok: false,
      error: "Google Sheets לא מוגדר (חסרים משתני סביבה)",
    }
  }

  try {
    await ensureHeaderRow()
    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_DATA),
    })
    const rows = res.data.values || []
    let updated = 0
    const touchedLeadIds = new Set<string>()

    for (const row of rows) {
      // M (index 12) — מזהה משתתף / מודרך
      const crmId = String(row[COL.crmId] || "").trim()
      if (!crmId) continue
      if (isNonAttendedCell(row[COL.attended])) continue

      // I / J — דגלי תעודה · N — קישור PDF
      const cardPrinted = truthyCell(row[COL.cardPrinted])
      const emailSent = truthyCell(row[COL.emailSent])
      const pdfUrl = String(row[COL.pdfUrl] || "").trim()

      if (!emailSent && !cardPrinted && !pdfUrl) continue

      const participant = await prisma.participant.findUnique({
        where: { id: crmId },
        select: {
          id: true,
          leadId: true,
          traineeId: true,
          fullName: true,
          idNumber: true,
          phone: true,
          email: true,
          certificateUrl: true,
        },
      })

      // מזהה מודרך ללא רשומת משתתף (ייצוא ממסך מודרכים)
      if (!participant) {
        const trainee = await prisma.trainee.findUnique({
          where: { id: crmId },
          select: {
            id: true,
            certificateEmailSent: true,
            certificateCardPrinted: true,
            certificateUrl: true,
          },
        })
        if (!trainee) continue

        const traineePatch: {
          certificateEmailSent?: boolean
          certificateCardPrinted?: boolean
          certificateUrl?: string
        } = {}
        if (emailSent && !trainee.certificateEmailSent) {
          traineePatch.certificateEmailSent = true
        }
        if (cardPrinted && !trainee.certificateCardPrinted) {
          traineePatch.certificateCardPrinted = true
        }
        if (pdfUrl && pdfUrl !== (trainee.certificateUrl || "")) {
          traineePatch.certificateUrl = pdfUrl
        }
        if (!Object.keys(traineePatch).length) continue

        await prisma.trainee.update({
          where: { id: trainee.id },
          data: traineePatch,
        })
        // סנכרון URL גם למשתתפים מקושרים אם יש
        if (traineePatch.certificateUrl) {
          await prisma.participant.updateMany({
            where: { traineeId: trainee.id },
            data: { certificateUrl: traineePatch.certificateUrl },
          })
        }
        updated++
        continue
      }

      let didUpdate = false

      if (pdfUrl && pdfUrl !== (participant.certificateUrl || "")) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { certificateUrl: pdfUrl },
        })
        didUpdate = true
      }

      let traineeId = participant.traineeId
      if (!traineeId && (emailSent || cardPrinted)) {
        const idNumber =
          participant.idNumber?.trim() || `sheet-${participant.id}`
        const trainee = await prisma.trainee.upsert({
          where: { idNumber },
          create: {
            fullName: participant.fullName || "ללא שם",
            idNumber,
            phone: participant.phone,
            email: participant.email,
            certificateEmailSent: emailSent,
            certificateCardPrinted: cardPrinted,
            certificateUrl: pdfUrl || null,
          },
          update: {
            ...(emailSent ? { certificateEmailSent: true } : {}),
            ...(cardPrinted ? { certificateCardPrinted: true } : {}),
            ...(pdfUrl ? { certificateUrl: pdfUrl } : {}),
          },
        })
        traineeId = trainee.id
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            traineeId,
            ...(pdfUrl ? { certificateUrl: pdfUrl } : {}),
          },
        })
        updated++
        touchedLeadIds.add(participant.leadId)
        continue
      }

      if (traineeId && (emailSent || cardPrinted || pdfUrl)) {
        const trainee = await prisma.trainee.findUnique({
          where: { id: traineeId },
          select: {
            certificateEmailSent: true,
            certificateCardPrinted: true,
            certificateUrl: true,
          },
        })
        if (trainee) {
          const patch: {
            certificateEmailSent?: boolean
            certificateCardPrinted?: boolean
            certificateUrl?: string
          } = {}
          if (emailSent && !trainee.certificateEmailSent) {
            patch.certificateEmailSent = true
          }
          if (cardPrinted && !trainee.certificateCardPrinted) {
            patch.certificateCardPrinted = true
          }
          if (pdfUrl && pdfUrl !== (trainee.certificateUrl || "")) {
            patch.certificateUrl = pdfUrl
          }
          if (Object.keys(patch).length) {
            await prisma.trainee.update({
              where: { id: traineeId },
              data: patch,
            })
            didUpdate = true
          }
        }
      }

      if (didUpdate) {
        updated++
        touchedLeadIds.add(participant.leadId)
      }
    }

    let autoCompleted = 0
    for (const leadId of touchedLeadIds) {
      const did = await tryAutoCompleteTrainingIfReady(leadId)
      if (did) autoCompleted++
    }

    return { ok: true, updated, autoCompleted }
  } catch (err) {
    console.error("[syncCertificateFlagsFromSheets]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בסנכרון מ-Google Sheets",
    }
  }
}

/**
 * מעבר אוטומטי ל״הסתיים״ (closed_won) רק אם:
 * - כל משתתפי ההדרכה עם תעודה במייל + כרטיס מודפס
 * - וההדרכה שולמה
 */
export async function tryAutoCompleteTrainingIfReady(
  leadId: string,
): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      participants: {
        include: {
          trainee: {
            select: {
              certificateEmailSent: true,
              certificateCardPrinted: true,
            },
          },
        },
      },
      trainingSales: {
        select: {
          id: true,
          quantity: true,
          unitSellingPrice: true,
          paymentStatus: true,
          createdAt: true,
          inventoryItem: { select: { name: true } },
        },
      },
    },
  })
  if (!lead) return false
  if (lead.courseStatus === "closed_won" || lead.courseStatus === "canceled") {
    return false
  }
  if (!lead.participants.length) return false

  const settled = isTrainingFullySettled({
    totalPrice: Number(lead.agreedPrice) || 0,
    paymentStatus: lead.paymentStatus || undefined,
    participants: lead.participants.map((p) => ({
      id: p.id,
      name: p.fullName,
      idNumber: p.idNumber || "",
      isExternal: Boolean(p.isExternal),
      isLead: Boolean(p.isLead),
      agreedPrice: p.agreedPrice != null ? Number(p.agreedPrice) : undefined,
      paymentStatus: p.paymentStatus || undefined,
    })),
    trainingSales: lead.trainingSales.map((s) => ({
      id: s.id,
      inventoryItemId: "",
      itemName: s.inventoryItem?.name || "מכירת ציוד",
      quantity: s.quantity,
      unitSellingPrice: Number(s.unitSellingPrice) || 0,
      unitCostPrice: 0,
      paymentStatus: s.paymentStatus || undefined,
      createdAt: s.createdAt?.toISOString?.() ?? new Date().toISOString(),
    })),
  })
  if (!settled) return false

  const allDone = lead.participants.every(
    (p) =>
      Boolean(p.trainee?.certificateEmailSent) &&
      Boolean(p.trainee?.certificateCardPrinted),
  )
  if (!allDone) return false

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      courseStatus: "closed_won",
      closedBy: lead.closedBy || "מערכת (תעודות+תשלום)",
      lastUpdatedBy: "מערכת",
    },
  })
  await prisma.activityLog.create({
    data: {
      leadId,
      performedBy: "מערכת",
      previousStatus: lead.courseStatus,
      newStatus: "closed_won",
    },
  })
  return true
}
