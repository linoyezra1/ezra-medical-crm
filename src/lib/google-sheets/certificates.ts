import { prisma } from "@/lib/db"
import {
  resolveDigitalCertStatus,
  resolvePhysicalCertStatus,
} from "@/lib/certificates-hub"
import {
  loadCertificateStatusRegistry,
  parseSheetCertificateCell,
  type ResolvedCertificateStatus,
} from "@/lib/certificate-status-registry"
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
import { formatLeadCategory } from "@/lib/helpers"

/**
 * כותרות עמודות בגיליון «תעודות» — 20 עמודות בסדר קבוע (A–T)
 * G–H / N ממולאים בגיליון או ע״י Apps Script
 * O = נוכחות (TRUE / לא נכח)
 * P–S = כתובת מגורים של המודרך
 * T = קטגוריה
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
  "קישור PDF לתעודה", // N — certificateUrl / certificatePdfUrl (Drive)
  "נוכחות", // O — attended
  "עיר", // P
  "כתובת / רחוב", // Q
  "מספר בית", // R
  "מיקוד", // S
  "קטגוריה", // T
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
  category: 19, // T
} as const

const SHEET_RANGE_HEADER = "A1:T1"
const SHEET_RANGE_DATA = "A2:T"
const SHEET_RANGE_APPEND = "A:T"
/** עמודת מזהה משתתף למניעת כפילויות */
const SHEET_RANGE_CRM_IDS = "M:M"
/** כותרות A–O לפני הרחבת כתובת/קטגוריה */
const LEGACY_HEADER_COLS = 15

function sheetCertStatusCells(p: {
  digitalCertStatus?: string | null
  physicalCertStatus?: string | null
  trainee?: {
    certificateEmailSent: boolean
    certificateCardPrinted: boolean
  } | null
}): [string, string] {
  return [
    resolvePhysicalCertStatus({
      storedStatus: p.physicalCertStatus,
      certificateCardPrinted: p.trainee?.certificateCardPrinted,
    }),
    resolveDigitalCertStatus({
      storedStatus: p.digitalCertStatus,
      certificateEmailSent: p.trainee?.certificateEmailSent,
    }),
  ]
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

  // גיליון עם A–S בלבד — מוסיפים כותרת T
  if (row.length >= 19) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, "T1"),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[CERTIFICATE_SHEET_HEADERS[19]]] },
    })
    return
  }

  // גיליון ישן A–O — מוסיפים כותרות P–T בלי לדרוס A–O
  if (row.length >= LEGACY_HEADER_COLS) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, "P1:T1"),
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

/** קטגוריה לתצוגה בגיליון (עמודה T) */
function categoryCell(p: {
  isExternal?: boolean | null
  courseCategory?: string | null
  lead?: {
    courseCategory?: string | null
    courseCategoryOther?: string | null
  } | null
}): string {
  const raw =
    (p.isExternal && p.courseCategory?.trim()
      ? p.courseCategory.trim()
      : "") ||
    p.lead?.courseCategoryOther?.trim() ||
    p.lead?.courseCategory?.trim() ||
    p.courseCategory?.trim() ||
    ""
  if (!raw) return ""
  const label = formatLeadCategory(raw)
  return label === "—" ? raw : label
}

/** P–T: כתובת + קטגוריה */
function addressAndCategoryCells(p: {
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingHouseNo?: string | null
  shippingZip?: string | null
  isExternal?: boolean | null
  courseCategory?: string | null
  lead?: {
    courseCategory?: string | null
    courseCategoryOther?: string | null
  } | null
}): string[] {
  return [...addressCells(p), categoryCell(p)]
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
  certificateUrl?: string | null
  attended?: boolean | null
  isExternal?: boolean | null
  courseType?: string | null
  courseCategory?: string | null
  digitalCertStatus?: string | null
  physicalCertStatus?: string | null
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingHouseNo?: string | null
  shippingZip?: string | null
  trainee?: {
    certificateEmailSent: boolean
    certificateCardPrinted: boolean
    certificateUrl?: string | null
  } | null
  lead?: {
    fullName: string
    scheduledStart: Date | null
    courseType: string | null
    courseTypeOther: string | null
    courseCategory?: string | null
    courseCategoryOther?: string | null
  } | null
}): (string | boolean)[] {
  const courseDate = trainingDateLabel(p.courseDate, p.lead?.scheduledStart)
  const certCourse = resolveParticipantCertificateCourseType(p)
  const hoursScope = hoursScopeForSheet(
    certCourse.courseType,
    certCourse.courseTypeOther,
  )
  const exportTimestamp = formatSheetDateTimeDdMmYyyy(new Date())
  const [physicalStatus, digitalStatus] = sheetCertStatusCells(p)
  const pdfUrl =
    p.certificateUrl?.trim() || p.trainee?.certificateUrl?.trim() || ""

  return [
    p.fullName || "", // A
    p.idNumber || "", // B
    courseDate, // C — DD/MM/YYYY
    p.email || "", // D
    p.phone || "", // E
    hoursScope, // F — «22» או «רענון 22» לפי סוג הקורס
    "", // G — מספר תעודה (מילוי בגיליון)
    "", // H — תוקף תעודה (מילוי בגיליון)
    physicalStatus, // I — תעודה פיזית (טקסט סטטוס)
    digitalStatus, // J — תעודה דיגיטלית (טקסט סטטוס)
    p.organizerName || p.lead?.fullName || "", // K
    exportTimestamp, // L — DD/MM/YYYY HH:mm
    p.id, // M — CRM_PARTICIPANT_ID
    pdfUrl, // N — קישור PDF / Drive (certificateUrl)
    attendanceCell(Boolean(p.attended)), // O — נוכחות
    ...addressAndCategoryCells(p), // P–T עיר / רחוב / בית / מיקוד / קטגוריה
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
            certificateUrl: true,
          },
        },
        lead: {
          select: {
            fullName: true,
            scheduledStart: true,
            courseType: true,
            courseTypeOther: true,
            courseCategory: true,
            courseCategoryOther: true,
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
    const certStatusUpdates: { range: string; values: string[][] }[] = []
    const pdfUrlUpdates: { range: string; values: string[][] }[] = []
    for (const p of participants) {
      const rowIndex = rowIndexFor(p)
      if (!rowIndex) continue
      attendanceUpdates.push({
        range: sheetA1(tab, `O${rowIndex}`),
        values: [[attendanceCell(Boolean(p.attended))]],
      })
      addressUpdates.push({
        range: sheetA1(tab, `P${rowIndex}:T${rowIndex}`),
        values: [addressAndCategoryCells(p)],
      })
      const [physicalStatus, digitalStatus] = sheetCertStatusCells(p)
      certStatusUpdates.push({
        range: sheetA1(tab, `I${rowIndex}:J${rowIndex}`),
        values: [[physicalStatus, digitalStatus]],
      })
      const pdfUrl =
        p.certificateUrl?.trim() || p.trainee?.certificateUrl?.trim() || ""
      if (pdfUrl) {
        pdfUrlUpdates.push({
          range: sheetA1(tab, `N${rowIndex}`),
          values: [[pdfUrl]],
        })
      }
    }
    const sheetUpdates = [
      ...attendanceUpdates,
      ...addressUpdates,
      ...certStatusUpdates,
      ...pdfUrlUpdates,
    ]
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
            courseCategory: true,
            courseCategoryOther: true,
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
          select: {
            id: true,
            courseDate: true,
            organizerName: true,
            isExternal: true,
            courseType: true,
            digitalCertStatus: true,
            physicalCertStatus: true,
            shippingCity: true,
            shippingStreet: true,
            shippingHouseNo: true,
            shippingZip: true,
            courseCategory: true,
            lead: {
              select: {
                fullName: true,
                scheduledStart: true,
                courseType: true,
                courseTypeOther: true,
                courseCategory: true,
                courseCategoryOther: true,
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
      const [physicalStatus, digitalStatus] = p
        ? sheetCertStatusCells({
            digitalCertStatus: p.digitalCertStatus,
            physicalCertStatus: p.physicalCertStatus,
            trainee: {
              certificateEmailSent: t.certificateEmailSent,
              certificateCardPrinted: t.certificateCardPrinted,
            },
          })
        : sheetCertStatusCells({
            trainee: {
              certificateEmailSent: t.certificateEmailSent,
              certificateCardPrinted: t.certificateCardPrinted,
            },
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
        physicalStatus,
        digitalStatus,
        p?.organizerName || lead?.fullName || "",
        formatSheetDateTimeDdMmYyyy(new Date()),
        p?.id || t.id, // M — מזהה משתתף אם יש, אחרת מודרך
        t.certificateUrl?.trim() || "", // N — קישור PDF / Drive
        "TRUE", // O — נוכחות
        ...addressAndCategoryCells(p || {}), // P–T
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
            courseCategory: true,
            courseCategoryOther: true,
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

/**
 * CRM → Sheets: עדכון קישור PDF לתעודה (עמודה N) לשורות קיימות
 * לפי מזהה משתתף / מודרך.
 */
export async function syncCertificateUrlsForParticipantIds(
  participantIds: string[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: true, updated: 0 }
  }
  const ids = [
    ...new Set(participantIds.map((id) => id.trim()).filter(Boolean)),
  ]
  if (!ids.length) return { ok: true, updated: 0 }

  try {
    const rows = await prisma.participant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        traineeId: true,
        certificateUrl: true,
        trainee: { select: { certificateUrl: true } },
      },
    })

    /** מפתח שורה בגיליון (participantId או traineeId) → קישור לעמודה N */
    const urlByCrmId = new Map<string, string>()
    for (const p of rows) {
      const url =
        p.certificateUrl?.trim() || p.trainee?.certificateUrl?.trim() || ""
      urlByCrmId.set(p.id, url)
      if (p.traineeId) urlByCrmId.set(p.traineeId, url)
    }
    if (!urlByCrmId.size) return { ok: true, updated: 0 }

    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_CRM_IDS),
    })
    const rowById = crmIdRowMap(existing.data.values)
    const updates: { range: string; values: string[][] }[] = []
    const seenRows = new Set<number>()
    for (const [crmId, url] of urlByCrmId) {
      const rowIndex = rowById.get(crmId)
      if (!rowIndex || seenRows.has(rowIndex)) continue
      seenRows.add(rowIndex)
      updates.push({
        range: sheetA1(tab, `N${rowIndex}`),
        values: [[url]],
      })
    }
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
    console.error("[syncCertificateUrlsForParticipantIds]", err)
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בעדכון קישור תעודה בגיליון",
    }
  }
}

/** CRM → Sheets: כתיבת טקסט סטטוס תעודה (I/J) לשורות קיימות */
export async function syncCertificateStatusesToSheets(): Promise<
  { ok: true; updated: number } | { ok: false; error: string }
> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: true, updated: 0 }
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
    if (!rows.length) return { ok: true, updated: 0 }

    const crmIds = rows
      .map((row) => String(row[COL.crmId] || "").trim())
      .filter(Boolean)
    if (!crmIds.length) return { ok: true, updated: 0 }

    const participants = await prisma.participant.findMany({
      where: { id: { in: crmIds } },
      select: {
        id: true,
        digitalCertStatus: true,
        physicalCertStatus: true,
        trainee: {
          select: {
            certificateEmailSent: true,
            certificateCardPrinted: true,
          },
        },
      },
    })
    const participantById = new Map(participants.map((p) => [p.id, p]))

    const trainees = await prisma.trainee.findMany({
      where: { id: { in: crmIds } },
      select: {
        id: true,
        certificateEmailSent: true,
        certificateCardPrinted: true,
      },
    })
    const traineeById = new Map(trainees.map((t) => [t.id, t]))

    const updates: { range: string; values: string[][] }[] = []
    rows.forEach((row, i) => {
      const crmId = String(row[COL.crmId] || "").trim()
      if (!crmId || isNonAttendedCell(row[COL.attended])) return

      const participant = participantById.get(crmId)
      const traineeOnly = traineeById.get(crmId)
      if (!participant && !traineeOnly) return

      const [physicalStatus, digitalStatus] = participant
        ? sheetCertStatusCells(participant)
        : sheetCertStatusCells({ trainee: traineeOnly })

      const currentPhysical = String(row[COL.cardPrinted] || "").trim()
      const currentDigital = String(row[COL.emailSent] || "").trim()
      if (
        currentPhysical === physicalStatus &&
        currentDigital === digitalStatus
      ) {
        return
      }

      updates.push({
        range: sheetA1(tab, `I${i + 2}:J${i + 2}`),
        values: [[physicalStatus, digitalStatus]],
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
    console.error("[syncCertificateStatusesToSheets]", err)
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "שגיאה בכתיבת סטטוסים ל-Google Sheets",
    }
  }
}

function traineeFlagsFromParsed(opts: {
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
  if (opts.digital) {
    out.certificateEmailSent = opts.digital.isCompleted
  }
  if (opts.physical) {
    out.certificateCardPrinted = opts.physical.isCompleted
  }
  return out
}

/** סנכרון דו-כיווני: משיכת I/J מהגיליון → CRM (מילון סטטוסים + isCompleted) */
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
    const registry = await loadCertificateStatusRegistry()
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
      const crmId = String(row[COL.crmId] || "").trim()
      if (!crmId) continue
      if (isNonAttendedCell(row[COL.attended])) continue

      const physicalParsed = parseSheetCertificateCell(
        row[COL.cardPrinted],
        "physical",
        registry,
      )
      const digitalParsed = parseSheetCertificateCell(
        row[COL.emailSent],
        "digital",
        registry,
      )
      const pdfUrl = String(row[COL.pdfUrl] || "").trim()

      if (!physicalParsed && !digitalParsed && !pdfUrl) continue

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
          digitalCertStatus: true,
          physicalCertStatus: true,
        },
      })

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
        } = traineeFlagsFromParsed({
          digital: digitalParsed,
          physical: physicalParsed,
        })
        if (pdfUrl && pdfUrl !== (trainee.certificateUrl || "")) {
          traineePatch.certificateUrl = pdfUrl
        }
        const hasChange =
          (traineePatch.certificateEmailSent !== undefined &&
            traineePatch.certificateEmailSent !==
              trainee.certificateEmailSent) ||
          (traineePatch.certificateCardPrinted !== undefined &&
            traineePatch.certificateCardPrinted !==
              trainee.certificateCardPrinted) ||
          traineePatch.certificateUrl !== undefined
        if (!hasChange) continue

        await prisma.trainee.update({
          where: { id: trainee.id },
          data: traineePatch,
        })
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
      const participantPatch: {
        digitalCertStatus?: string
        physicalCertStatus?: string
        certificateUrl?: string
      } = {}

      if (digitalParsed) {
        participantPatch.digitalCertStatus = digitalParsed.label
      }
      if (physicalParsed) {
        participantPatch.physicalCertStatus = physicalParsed.label
      }
      if (pdfUrl && pdfUrl !== (participant.certificateUrl || "")) {
        participantPatch.certificateUrl = pdfUrl
      }

      if (Object.keys(participantPatch).length) {
        const changed =
          (participantPatch.digitalCertStatus !== undefined &&
            participantPatch.digitalCertStatus !==
              (participant.digitalCertStatus || "").trim()) ||
          (participantPatch.physicalCertStatus !== undefined &&
            participantPatch.physicalCertStatus !==
              (participant.physicalCertStatus || "").trim()) ||
          participantPatch.certificateUrl !== undefined
        if (changed) {
          await prisma.participant.update({
            where: { id: participant.id },
            data: participantPatch,
          })
          didUpdate = true
        }
      }

      const flagPatch = traineeFlagsFromParsed({
        digital: digitalParsed,
        physical: physicalParsed,
      })

      let traineeId = participant.traineeId
      if (
        !traineeId &&
        (digitalParsed || physicalParsed || pdfUrl)
      ) {
        const idNumber =
          participant.idNumber?.trim() || `sheet-${participant.id}`
        const trainee = await prisma.trainee.upsert({
          where: { idNumber },
          create: {
            fullName: participant.fullName || "ללא שם",
            idNumber,
            phone: participant.phone,
            email: participant.email,
            certificateEmailSent: flagPatch.certificateEmailSent ?? false,
            certificateCardPrinted:
              flagPatch.certificateCardPrinted ?? false,
            certificateUrl: pdfUrl || null,
          },
          update: {
            ...flagPatch,
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

      if (traineeId && (digitalParsed || physicalParsed || pdfUrl)) {
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
          } = { ...flagPatch }
          if (pdfUrl && pdfUrl !== (trainee.certificateUrl || "")) {
            patch.certificateUrl = pdfUrl
          }
          const hasChange =
            (patch.certificateEmailSent !== undefined &&
              patch.certificateEmailSent !== trainee.certificateEmailSent) ||
            (patch.certificateCardPrinted !== undefined &&
              patch.certificateCardPrinted !==
                trainee.certificateCardPrinted) ||
            (patch.certificateUrl !== undefined &&
              patch.certificateUrl !== (trainee.certificateUrl || ""))
          if (hasChange) {
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
