import { prisma } from "@/lib/db"
import {
  resolveDigitalCertStatus,
  resolveHubRoutingBody,
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
  getCertificateStartNumber,
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
 * כותרות עמודות בגיליון «תעודות» — 21 עמודות בסדר קבוע (A–U)
 * G–H / N ממולאים בגיליון או ע״י Apps Script
 * O = נוכחות (TRUE / לא נכח)
 * P–S = כתובת מגורים של המודרך
 * T = קטגוריה
 * U = תעודות דרך מי (אותו ערך כמו בניהול התעודות)
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
  "תעודות דרך מי", // U
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
  certifyingBody: 20, // U
} as const

const SHEET_RANGE_HEADER = "A1:U1"
const SHEET_RANGE_DATA = "A2:U"
/** מספר עמודות קבוע לכתיבה בטוחה (A–U) */
const CERTIFICATE_COL_COUNT = CERTIFICATE_SHEET_HEADERS.length
/** עמודת מזהה משתתף למניעת כפילויות */
const SHEET_RANGE_CRM_IDS = "M:M"
/** כותרות A–O לפני הרחבת כתובת/קטגוריה */
const LEGACY_HEADER_COLS = 15

function padCertificateRow(
  row: (string | boolean | number | null | undefined)[],
): string[] {
  const out = row.map((c) => (c == null ? "" : String(c)))
  while (out.length < CERTIFICATE_COL_COUNT) out.push("")
  return out.slice(0, CERTIFICATE_COL_COUNT)
}

/**
 * כתיבה בטוחה לגיליון תעודות — בלי values.append.
 * מוצא את השורה הראשונה שבה עמודה A ריקה (אחרי כותרת) וכותב A{n}:U{…}.
 * מונע הזזה ימינה כשיש תאים יתומים / נתונים מעבר ל־U.
 */
async function appendCertificateRowsSafe(
  values: (string | boolean | number | null | undefined)[][],
): Promise<{ startRow: number; count: number }> {
  if (!values.length) return { startRow: 2, count: 0 }

  const sheets = await getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const tab = getSheetTabName()

  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetA1(tab, "A:A"),
    majorDimension: "ROWS",
  })
  const aValues = colA.data.values || []

  // aValues[0] = A1 (כותרת). מחפשים A ריק משורה 2 ואילך.
  let nextRow = Math.max(2, aValues.length + 1)
  for (let i = 1; i < aValues.length; i++) {
    const cell = String(aValues[i]?.[0] ?? "").trim()
    if (!cell) {
      nextRow = i + 1
      break
    }
  }

  const padded = values.map(padCertificateRow)
  const endRow = nextRow + padded.length - 1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetA1(tab, `A${nextRow}:U${endRow}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: padded },
  })

  console.log(
    "[certificates:issue] sheets:safe-write",
    "נכתבו שורות ל־A:U",
    { startRow: nextRow, endRow, count: padded.length },
  )

  return { startRow: nextRow, count: padded.length }
}

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

  // גיליון עם A–T — מוסיפים רק כותרת U
  if (row.length >= 20) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, "U1"),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[CERTIFICATE_SHEET_HEADERS[20]]] },
    })
    return
  }

  // גיליון עם A–S — מוסיפים כותרות T–U
  if (row.length >= 19) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, "T1:U1"),
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[...CERTIFICATE_SHEET_HEADERS.slice(19)]],
      },
    })
    return
  }

  // גיליון ישן A–O — מוסיפים כותרות P–U בלי לדרוס A–O
  if (row.length >= LEGACY_HEADER_COLS) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetA1(tab, "P1:U1"),
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

/** אותו ערך שמפלג את ניהול התעודות */
function certifyingBodyCell(p: {
  certifyingBody?: string | null
  isExternal?: boolean | null
  lead?: { deliveryMethod?: string | null } | null
}): string {
  return resolveHubRoutingBody({
    participantBody: p.certifyingBody,
    isExternal: Boolean(p.isExternal),
    leadDeliveryMethod: p.lead?.deliveryMethod,
  }).body
}

/** P–U: כתובת + קטגוריה + תעודות דרך מי */
function sheetTailCells(p: {
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingHouseNo?: string | null
  shippingZip?: string | null
  isExternal?: boolean | null
  courseCategory?: string | null
  certifyingBody?: string | null
  lead?: {
    courseCategory?: string | null
    courseCategoryOther?: string | null
    deliveryMethod?: string | null
  } | null
}): string[] {
  return [...addressAndCategoryCells(p), certifyingBodyCell(p)]
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
  // תאריך הליד קודם — אחרת נשאר תאריך ישן מ־participant.courseDate אחרי עדכון הדרכה
  if (scheduledStart) {
    const fromLead = formatSheetDateDdMmYyyy(scheduledStart)
    if (fromLead) return fromLead
  }
  if (courseDate?.trim()) {
    return formatSheetDateDdMmYyyy(courseDate.trim()) || courseDate.trim()
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
  certifyingBody?: string | null
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
    deliveryMethod?: string | null
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
    hoursScope, // F — «22 שעות» / «רענון 8» / «BLS»
    "", // G — מספר תעודה (מילוי בגיליון)
    "", // H — תוקף תעודה (מילוי בגיליון)
    physicalStatus, // I — תעודה פיזית (טקסט סטטוס)
    digitalStatus, // J — תעודה דיגיטלית (טקסט סטטוס)
    p.organizerName || p.lead?.fullName || "", // K
    exportTimestamp, // L — DD/MM/YYYY HH:mm
    p.id, // M — CRM_PARTICIPANT_ID
    pdfUrl, // N — קישור PDF / Drive (certificateUrl)
    attendanceCell(Boolean(p.attended)), // O — נוכחות
    ...sheetTailCells(p), // P–U עיר / רחוב / בית / מיקוד / קטגוריה / תעודות דרך מי
  ]
}

/** תוקף = תאריך הדרכה + 2 שנים (DD/MM/YYYY) */
function addTwoYearsDdMmYyyy(courseDate: string): string {
  const raw = (courseDate || "").trim()
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  let year: number
  let month: number
  let day: number
  if (dmy) {
    day = Number(dmy[1])
    month = Number(dmy[2])
    year = Number(dmy[3])
  } else if (ymd) {
    year = Number(ymd[1])
    month = Number(ymd[2])
    day = Number(ymd[3])
  } else {
    return ""
  }
  const d = new Date(year + 2, month - 1, day)
  if (Number.isNaN(d.getTime())) return ""
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}

function crmIdRowMap(
  columnM: unknown[][] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < (columnM || []).length; i++) {
    const id = String(columnM?.[i]?.[0] || "").trim()
    if (!id || isCrmIdHeaderCell(id)) continue
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
            deliveryMethod: true,
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

    const identityUpdates: { range: string; values: string[][] }[] = []
    const attendanceUpdates: { range: string; values: string[][] }[] = []
    const addressUpdates: { range: string; values: string[][] }[] = []
    const certStatusUpdates: { range: string; values: string[][] }[] = []
    const pdfUrlUpdates: { range: string; values: string[][] }[] = []
    for (const p of participants) {
      const rowIndex = rowIndexFor(p)
      if (!rowIndex) continue
      // A–F: שם/ת״ז/תאריך/מייל/טלפון/שעות מה־CRM (לא נשארים ערכים ישנים בגיליון)
      const row = participantRow(p)
      identityUpdates.push({
        range: sheetA1(tab, `A${rowIndex}:F${rowIndex}`),
        values: [row.slice(0, 6).map((v) => String(v ?? ""))],
      })
      attendanceUpdates.push({
        range: sheetA1(tab, `O${rowIndex}`),
        values: [[attendanceCell(Boolean(p.attended))]],
      })
      addressUpdates.push({
        range: sheetA1(tab, `P${rowIndex}:U${rowIndex}`),
        values: [sheetTailCells(p)],
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
      ...identityUpdates,
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
      await appendCertificateRowsSafe(toExport.map((p) => participantRow(p)))

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
            deliveryMethod: true,
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

    await appendCertificateRowsSafe([
      participantRow({ ...p, attended: true }),
    ])
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

function isCrmIdHeaderCell(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  const lower = v.toLowerCase()
  return (
    v.includes("מזהה משתתף") ||
    lower === "crm_participant_id" ||
    lower === "idcrm" ||
    lower === "crm id" ||
    lower === "crmid"
  )
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
      .filter((v) => v && !isCrmIdHeaderCell(v)),
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
            certifyingBody: true,
            lead: {
              select: {
                fullName: true,
                scheduledStart: true,
                courseType: true,
                courseTypeOther: true,
                courseCategory: true,
                courseCategoryOther: true,
                deliveryMethod: true,
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
      // תמיד trainee.id בעמודה M כשמייצאים ממסך מודרכים —
      // כדי שההנפקה תמצא את השורה גם בלי participant מקושר בגיליון.
      // (כינויי participant↔trainee מטופלים גם ב־ensureCertificateDetails)
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
        t.id, // M — מזהה מודרך
        "", // N — תמיד ריק בייצוא; PDF חדש נוצר בהנפקה
        "TRUE", // O — נוכחות
        ...sheetTailCells({
          ...(p || {}),
          certifyingBody: p?.certifyingBody || t.certifyingBody,
        }), // P–U
      ]
    })

    await appendCertificateRowsSafe(values)

    return { ok: true, exported: toExport.length }
  } catch (err) {
    console.error("[exportTraineesToCertificateSheet]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בייצוא מודרכים ל-Google Sheets",
    }
  }
}

type SyncParticipantPayload = {
  id: string
  crmId: string
  fullName: string
  idNumber: string
  phone: string
  email: string
  courseDate: string
  city: string
  street: string
  address: string
  houseNumber: string
  zipCode: string
  postalCode: string
  inviterName: string
  organizerName: string
  hours: string
  hoursScope: string
  attendance: boolean
  attendanceStatus: string
  courseCategory: string
  category: string
  certifyingBody: string
  certificateUrl: string
  certificatePdfUrl: string
  pdfUrl: string
}

function participantToAppsScriptSyncPayload(
  p: Parameters<typeof participantRow>[0],
): SyncParticipantPayload {
  const courseDate = trainingDateLabel(p.courseDate, p.lead?.scheduledStart)
  const certCourse = resolveParticipantCertificateCourseType(p)
  const hoursScope = hoursScopeForSheet(
    certCourse.courseType,
    certCourse.courseTypeOther,
  )
  const inviter = sheetText(p.organizerName) || sheetText(p.lead?.fullName)
  const street = sheetText(p.shippingStreet)
  const zip = sheetText(p.shippingZip)
  const category = categoryCell(p)
  const body = certifyingBodyCell(p)
  const pdfUrl =
    p.certificateUrl?.trim() || p.trainee?.certificateUrl?.trim() || ""
  const attendanceStatus = attendanceCell(Boolean(p.attended))

  return {
    id: p.id,
    crmId: p.id,
    fullName: sheetText(p.fullName),
    idNumber: sheetText(p.idNumber),
    phone: sheetText(p.phone),
    email: sheetText(p.email),
    courseDate,
    city: sheetText(p.shippingCity),
    street,
    address: street,
    houseNumber: sheetText(p.shippingHouseNo),
    zipCode: zip,
    postalCode: zip,
    inviterName: inviter,
    organizerName: inviter,
    hours: hoursScope,
    hoursScope,
    attendance: Boolean(p.attended),
    attendanceStatus,
    courseCategory: category,
    category,
    certifyingBody: body,
    certificateUrl: pdfUrl,
    certificatePdfUrl: pdfUrl,
    pdfUrl,
  }
}

/**
 * דוחף action=sync ל־Apps Script (הגיליון המחובר לסקריפט).
 * דורש GOOGLE_APPS_SCRIPT_WEBHOOK_URL + GOOGLE_APPS_SCRIPT_SECURITY_PIN.
 */
async function pushParticipantsSyncToAppsScript(
  participantsToAdd: SyncParticipantPayload[],
): Promise<{ ok: true; added: number; updated: number } | { ok: false; error: string }> {
  if (!participantsToAdd.length) {
    return { ok: true, added: 0, updated: 0 }
  }

  const webhookUrl =
    process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL?.trim()
  const pin =
    process.env.GOOGLE_APPS_SCRIPT_SECURITY_PIN?.trim() ||
    process.env.CERTIFICATES_APPS_SCRIPT_PIN?.trim() ||
    process.env.CERTIFICATE_ISSUANCE_PIN?.trim() ||
    "214215444"

  if (!webhookUrl) {
    return {
      ok: false,
      error: "חסר GOOGLE_APPS_SCRIPT_WEBHOOK_URL לסנכרון דרך הסקריפט",
    }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync",
        pin,
        authPin: pin,
        participantsToAdd,
      }),
    })
    const text = await res.text()
    let json: {
      success?: boolean
      ok?: boolean
      message?: string
      error?: string
      addedCount?: number
      updatedCount?: number
    } = {}
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      return {
        ok: false,
        error: `Apps Script sync: תשובה לא־JSON (HTTP ${res.status})`,
      }
    }
    if (!res.ok || json.success === false || json.ok === false) {
      return {
        ok: false,
        error: json.error || json.message || `Apps Script sync נכשל (HTTP ${res.status})`,
      }
    }
    console.log("[certificates:sync] apps-script-sync-ok", {
      added: json.addedCount ?? 0,
      updated: json.updatedCount ?? 0,
      sent: participantsToAdd.length,
    })
    return {
      ok: true,
      added: Number(json.addedCount) || 0,
      updated: Number(json.updatedCount) || 0,
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאת רשת בסנכרון ל־Apps Script",
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

    const participants = await prisma.participant.findMany({
      where: { attended: true },
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
            deliveryMethod: true,
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
    if (!toExport.length) {
      console.log("[certificates:sync] export-missing: אין חדשים לכתיבה", {
        attended: participants.length,
        alreadyInSheet: existingIds.size,
      })
      return { ok: true, exported: 0 }
    }

    await appendCertificateRowsSafe(toExport.map((p) => participantRow(p)))

    // גיבוי: כתיבה גם דרך Apps Script לגיליון המחובר לסקריפט
    const scriptSync = await pushParticipantsSyncToAppsScript(
      toExport.map((p) => participantToAppsScriptSyncPayload(p)),
    )
    if (!scriptSync.ok) {
      console.warn(
        "[certificates:sync] apps-script-sync-skip",
        scriptSync.error,
      )
    }

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
    const { lookupIds } = await expandCrmIdAliases(ids)
    const lookupList = [...lookupIds]
    const rows = await prisma.participant.findMany({
      where: {
        OR: [{ id: { in: lookupList } }, { traineeId: { in: lookupList } }],
      },
      select: {
        id: true,
        traineeId: true,
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
    const hoursById = new Map<string, string>()
    for (const p of rows) {
      const cert = resolveParticipantCertificateCourseType(p)
      const hours = hoursScopeForSheet(cert.courseType, cert.courseTypeOther)
      hoursById.set(p.id, hours)
      if (p.traineeId) hoursById.set(p.traineeId, hours)
    }

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

export type SheetCertificateDetails = {
  rowIndex: number
  crmId: string
  fullName: string
  idNumber: string
  email: string
  hours: string
  courseDate: string
  certificateNumber: string
  validUntil: string
  pdfUrl: string
}

/**
 * מרחיב מזהי CRM לסט כינויים: משתתף ↔ מודרך,
 * כי בעמודה M יכול להופיע participant.id או trainee.id.
 */
async function expandCrmIdAliases(
  ids: string[],
): Promise<{
  /** כל המזהים לחיפוש בגיליון */
  lookupIds: Set<string>
  /** מזהה שביקשו → כל הכינויים שלו */
  aliasesByRequestId: Map<string, string[]>
}> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const aliasesByRequestId = new Map<string, string[]>()
  const lookupIds = new Set<string>(unique)

  if (!unique.length) {
    return { lookupIds, aliasesByRequestId }
  }

  const participants = await prisma.participant.findMany({
    where: { id: { in: unique } },
    select: { id: true, traineeId: true },
  })
  const trainees = await prisma.trainee.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      participants: { select: { id: true }, take: 20 },
    },
  })

  for (const id of unique) {
    const aliases = new Set<string>([id])
    const asParticipant = participants.find((p) => p.id === id)
    if (asParticipant?.traineeId) {
      aliases.add(asParticipant.traineeId)
      lookupIds.add(asParticipant.traineeId)
    }
    const asTrainee = trainees.find((t) => t.id === id)
    if (asTrainee) {
      for (const p of asTrainee.participants) {
        aliases.add(p.id)
        lookupIds.add(p.id)
      }
    }
    aliasesByRequestId.set(id, [...aliases])
  }

  return { lookupIds, aliasesByRequestId }
}

/**
 * אחרי ייצוא לגיליון: מוודא מספר תעודה (G) ותוקף (H) לכל משתתף ב־CRM בלבד
 * (לא תלוי ב־autoFillCertDetails בסקריפט).
 * מספור רץ מ־CERTIFICATE_START_NUMBER (ברירת מחדל 45825).
 * תוקף תמיד = תאריך הדרכה + 2 שנים.
 * מתאים גם כש־M מכיל participant.id והבקשה הגיעה עם trainee.id (ולהפך).
 */
export async function ensureCertificateDetailsForParticipantIds(
  participantIds: string[],
): Promise<
  | { ok: true; details: SheetCertificateDetails[]; missingRequestIds: string[] }
  | { ok: false; error: string }
> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: false, error: "Google Sheets לא מוגדר" }
  }
  const ids = [
    ...new Set(participantIds.map((id) => String(id || "").trim()).filter(Boolean)),
  ]
  if (!ids.length) return { ok: true, details: [], missingRequestIds: [] }

  try {
    const { lookupIds, aliasesByRequestId } = await expandCrmIdAliases(ids)

    // מקור אמת להנפקה: CRM (שם/ת״ז/מייל/שעות/תאריך) — לא ערכים ישנים בגיליון
    type CrmOverlay = {
      fullName: string
      idNumber: string
      email: string
      hours: string
      courseDate: string
    }
    const overlayById = new Map<string, CrmOverlay>()
    const lookupList = [...lookupIds]
    const crmParticipants = await prisma.participant.findMany({
      where: {
        OR: [{ id: { in: lookupList } }, { traineeId: { in: lookupList } }],
      },
      select: {
        id: true,
        traineeId: true,
        fullName: true,
        idNumber: true,
        email: true,
        courseDate: true,
        courseType: true,
        isExternal: true,
        lead: {
          select: {
            scheduledStart: true,
            courseType: true,
            courseTypeOther: true,
          },
        },
        trainee: {
          select: {
            id: true,
            fullName: true,
            idNumber: true,
            email: true,
          },
        },
      },
    })
    for (const p of crmParticipants) {
      const cert = resolveParticipantCertificateCourseType(p)
      const overlay: CrmOverlay = {
        fullName: (p.fullName || p.trainee?.fullName || "").trim(),
        idNumber: (p.idNumber || p.trainee?.idNumber || "").trim(),
        email: (p.email || p.trainee?.email || "").trim(),
        hours: hoursScopeForSheet(cert.courseType, cert.courseTypeOther),
        courseDate: trainingDateLabel(p.courseDate, p.lead?.scheduledStart),
      }
      overlayById.set(p.id, overlay)
      if (p.traineeId) overlayById.set(p.traineeId, overlay)
    }
    const crmTrainees = await prisma.trainee.findMany({
      where: { id: { in: lookupList } },
      select: {
        id: true,
        fullName: true,
        idNumber: true,
        email: true,
      },
    })
    for (const t of crmTrainees) {
      if (overlayById.has(t.id)) continue
      overlayById.set(t.id, {
        fullName: (t.fullName || "").trim(),
        idNumber: (t.idNumber || "").trim(),
        email: (t.email || "").trim(),
        hours: "",
        courseDate: "",
      })
    }

    const sheets = await getSheetsClient()
    const spreadsheetId = getSpreadsheetId()
    const tab = getSheetTabName()
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetA1(tab, SHEET_RANGE_DATA),
    })
    const rows = existing.data.values || []

    // רצף מ־45825 ומעלה: מתעלמים ממספרים ישנים מתחת ליסוד
    const startNum = getCertificateStartNumber()
    let maxNum = startNum - 1
    for (const row of rows) {
      const n = parseInt(String(row[COL.certificateNumber] || "").trim(), 10)
      if (!Number.isNaN(n) && n >= startNum && n > maxNum) maxNum = n
    }
    let nextNum = maxNum + 1

    const updates: { range: string; values: string[][] }[] = []
    const details: SheetCertificateDetails[] = []
    const seenRows = new Set<number>()
    /** מזהה בגיליון (M) → פרטי שורה */
    const detailsBySheetId = new Map<string, SheetCertificateDetails>()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || []
      const crmId = String(row[COL.crmId] || "").trim()
      if (!crmId || !lookupIds.has(crmId)) continue
      const rowIndex = i + 2
      if (seenRows.has(rowIndex)) continue
      seenRows.add(rowIndex)

      const crm = overlayById.get(crmId)
      let fullName = String(row[COL.fullName] || "").trim()
      let idNumber = String(row[COL.idNumber] || "").trim()
      let email = String(row[COL.email] || "").trim()
      let hours = String(row[COL.hours] || "").trim()
      const courseDateRaw = row[COL.courseDate]
      let courseDate =
        formatSheetDateDdMmYyyy(courseDateRaw) ||
        String(courseDateRaw || "").trim()

      if (crm) {
        if (crm.fullName && crm.fullName !== fullName) {
          fullName = crm.fullName
          updates.push({
            range: sheetA1(tab, `A${rowIndex}`),
            values: [[fullName]],
          })
        }
        if (crm.idNumber && crm.idNumber !== idNumber) {
          idNumber = crm.idNumber
          updates.push({
            range: sheetA1(tab, `B${rowIndex}`),
            values: [[idNumber]],
          })
        }
        if (crm.courseDate && crm.courseDate !== courseDate) {
          courseDate = crm.courseDate
          updates.push({
            range: sheetA1(tab, `C${rowIndex}`),
            values: [[courseDate]],
          })
        }
        if (crm.email && crm.email !== email) {
          email = crm.email
          updates.push({
            range: sheetA1(tab, `D${rowIndex}`),
            values: [[email]],
          })
        }
        // היקף שעות תמיד מה־CRM (סוג קורס עדכני) — גם אם בגיליון יש ערך ישן זהה-לכאורה
        if (crm.hours) {
          if (crm.hours !== hours) {
            updates.push({
              range: sheetA1(tab, `F${rowIndex}`),
              values: [[crm.hours]],
            })
          }
          hours = crm.hours
        }
      }

      let certificateNumber = String(row[COL.certificateNumber] || "").trim()
      const existingNum = parseInt(certificateNumber, 10)
      const needsNewNumber =
        !certificateNumber ||
        Number.isNaN(existingNum) ||
        existingNum < startNum

      if (needsNewNumber) {
        certificateNumber = String(nextNum++)
        updates.push({
          range: sheetA1(tab, `G${rowIndex}`),
          values: [[certificateNumber]],
        })
      }

      // תוקף תמיד שנתיים מתאריך ההדרכה (נכתב ל־H בהנפקה)
      let validUntil = ""
      if (courseDate) {
        validUntil = addTwoYearsDdMmYyyy(courseDate)
        if (validUntil) {
          const existingValid =
            formatSheetDateDdMmYyyy(row[COL.certificateExpiry]) ||
            String(row[COL.certificateExpiry] || "").trim()
          if (existingValid !== validUntil) {
            updates.push({
              range: sheetA1(tab, `H${rowIndex}`),
              values: [[validUntil]],
            })
          }
        }
      }

      const pdfUrl = String(row[COL.pdfUrl] || "").trim()

      const detail: SheetCertificateDetails = {
        rowIndex,
        crmId,
        fullName,
        idNumber,
        email,
        hours,
        courseDate,
        certificateNumber,
        validUntil,
        pdfUrl,
      }
      details.push(detail)
      detailsBySheetId.set(crmId, detail)
    }

    if (updates.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updates,
        },
      })
    }

    const missingRequestIds = ids.filter((requestId) => {
      const aliases = aliasesByRequestId.get(requestId) || [requestId]
      return !aliases.some((a) => detailsBySheetId.has(a))
    })

    if (missingRequestIds.length) {
      console.warn(
        "[certificates:issue] sheets:details",
        "חסרים מזהים בגיליון",
        { missingRequestIds, foundRows: details.length },
      )
    }

    return { ok: true, details, missingRequestIds }
  } catch (err) {
    console.error(
      "[certificates:issue] sheets:details",
      "שגיאה בהקצאת מספרי תעודה בגיליון",
      err,
    )
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בהקצאת מספרי תעודה בגיליון",
    }
  }
}

/**
 * CRM → Sheets: עדכון קישור PDF לתעודה (עמודה N) לשורות קיימות
 * לפי מזהה משתתף / מודרך.
 */
/**
 * מאפס עמודה J (נשלח במייל) לפני הנפקה מחדש —
 * כדי שמחיקת N + הנפקה מחדש תשלח מייל שוב ותסמן מחדש.
 */
export async function resetCertificateEmailSentInSheet(
  participantIds: string[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (!isGoogleSheetsConfigured()) return { ok: true, updated: 0 }
  const ids = [
    ...new Set(participantIds.map((id) => id.trim()).filter(Boolean)),
  ]
  if (!ids.length) return { ok: true, updated: 0 }

  try {
    const { lookupIds } = await expandCrmIdAliases(ids)
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
    for (const crmId of lookupIds) {
      const rowIndex = rowById.get(crmId)
      if (!rowIndex || seenRows.has(rowIndex)) continue
      seenRows.add(rowIndex)
      updates.push({
        range: sheetA1(tab, `J${rowIndex}`),
        values: [[""]],
      })
    }
    if (!updates.length) return { ok: true, updated: 0 }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    })
    return { ok: true, updated: updates.length }
  } catch (err) {
    console.error("[resetCertificateEmailSentInSheet]", err)
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה באיפוס סימון מייל בגיליון",
    }
  }
}

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

    // RAW — לא לתת ל־Sheets «לפרש» את ה־URL של Cloudinary
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
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
