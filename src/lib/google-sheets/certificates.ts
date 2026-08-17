import { prisma } from "@/lib/db"
import {
  extractCourseHoursDigits,
  resolveParticipantCertificateCourseType,
} from "@/lib/course-type"
import { PAID_PAYMENT_STATUS } from "@/lib/payment"
import {
  getSheetTabName,
  getSheetsClient,
  getSpreadsheetId,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"
import { formatInJerusalem } from "@/lib/timezone"

/**
 * כותרות עמודות בגיליון «תעודות» — 14 עמודות בסדר קבוע (A–N)
 * G–H / N ממולאים בגיליון או ע״י Apps Script
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
} as const

const SHEET_RANGE_HEADER = "A1:N1"
const SHEET_RANGE_DATA = "A2:N"
const SHEET_RANGE_APPEND = "A:N"
/** עמודת מזהה משתתף למניעת כפילויות */
const SHEET_RANGE_CRM_IDS = "M:M"

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
  const range = `${tab}!${SHEET_RANGE_HEADER}`
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })
  const row = existing.data.values?.[0]
  // אם יש כבר שורת כותרת עם לפחות 13 תאים — לא דורסים (הגיליון עשוי להיות מוגדר ידנית)
  if (row && row.length >= CERTIFICATE_SHEET_HEADERS.length) return

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[...CERTIFICATE_SHEET_HEADERS]] },
  })
}

function trainingDateLabel(
  courseDate: string | null | undefined,
  scheduledStart: Date | null | undefined,
): string {
  if (courseDate?.trim()) return courseDate.trim()
  if (scheduledStart) {
    return formatInJerusalem(scheduledStart).date || ""
  }
  return ""
}

/** היקף שעות לגיליון — ספרות בלבד (למשל «רענון 22» → «22»), ללא ברירת מחדל 44 */
function hoursScopeForSheet(
  courseType?: string | null,
  courseTypeOther?: string | null,
): string {
  return extractCourseHoursDigits(courseType, courseTypeOther)
}

function participantRow(p: {
  id: string
  fullName: string
  idNumber: string
  phone: string | null
  email: string | null
  organizerName: string | null
  courseDate: string | null
  isExternal?: boolean | null
  courseType?: string | null
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
  const exportTimestamp = new Date().toISOString()

  // I/J מתחילים ריקים — ממולאים בגיליון; סנכרון קורא משם חזרה ל-CRM
  return [
    p.fullName || "", // A
    p.idNumber || "", // B
    courseDate, // C
    p.email || "", // D
    p.phone || "", // E
    hoursScope, // F — למשל "22" ולא "22 שעות"
    "", // G — מספר תעודה (מילוי בגיליון)
    "", // H — תוקף תעודה (מילוי בגיליון)
    "", // I — הודפס כרטיס (מילוי בגיליון)
    "", // J — נשלח במייל (מילוי בגיליון)
    p.organizerName || p.lead?.fullName || "", // K
    exportTimestamp, // L
    p.id, // M — CRM_PARTICIPANT_ID
    "", // N — קישור PDF (מילוי בגיליון / Apps Script)
  ]
}

/** ייצוא משתתפי הדרכה לגיליון (append בלבד, ללא כפילויות לפי CRM_PARTICIPANT_ID בעמודה M) */
export async function exportLeadParticipantsToSheets(
  leadId: string,
): Promise<{ ok: true; exported: number } | { ok: false; error: string }> {
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

    if (!participants.length) return { ok: true, exported: 0 }

    // מזהים שכבר בגיליון — עמודה M
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!${SHEET_RANGE_CRM_IDS}`,
    })
    const existingIds = new Set(
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

    // כפילויות רק לפי עמודה M בגיליון — לא לפי sheetsExportedAt ב-DB
    // (מחיקה מהגיליון מאפשרת ייצוא מחדש אוטומטית)
    const toExport = participants.filter((p) => !existingIds.has(p.id))
    if (!toExport.length) return { ok: true, exported: 0 }

    const values = toExport.map((p) => participantRow(p))
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!${SHEET_RANGE_APPEND}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })

    // חותמת אופציונלית לביקורת בלבד — לא משמשת לחסימת ייצוא
    const now = new Date()
    await prisma.participant.updateMany({
      where: { id: { in: toExport.map((p) => p.id) } },
      data: { sheetsExportedAt: now },
    })

    return { ok: true, exported: toExport.length }
  } catch (err) {
    console.error("[exportLeadParticipantsToSheets]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בייצוא ל-Google Sheets",
    }
  }
}

async function fetchExistingCrmIdsInSheet(): Promise<Set<string>> {
  const sheets = await getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const tab = getSheetTabName()
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!${SHEET_RANGE_CRM_IDS}`,
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
          take: 1,
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
    const toExport = trainees.filter((t) => !existingIds.has(t.id))
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
        new Date().toISOString(),
        t.id, // M — מזהה מודרך (גם ללא שיוך להדרכה)
        "", // N — קישור PDF
      ]
    })

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!${SHEET_RANGE_APPEND}`,
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
      range: `${tab}!${SHEET_RANGE_DATA}`,
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
        range: `${tab}!F${i + 2}`,
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
      range: `${tab}!${SHEET_RANGE_DATA}`,
    })
    const rows = res.data.values || []
    let updated = 0
    const touchedLeadIds = new Set<string>()

    for (const row of rows) {
      // M (index 12) — מזהה משתתף / מודרך
      const crmId = String(row[COL.crmId] || "").trim()
      if (!crmId) continue

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
    },
  })
  if (!lead) return false
  if (lead.courseStatus === "closed_won" || lead.courseStatus === "canceled") {
    return false
  }
  if (lead.paymentStatus !== PAID_PAYMENT_STATUS) return false
  if (!lead.participants.length) return false

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
