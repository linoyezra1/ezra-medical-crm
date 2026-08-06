import { prisma } from "@/lib/db"
import { PAID_PAYMENT_STATUS } from "@/lib/payment"
import {
  getSheetTabName,
  getSheetsClient,
  getSpreadsheetId,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"

/** כותרות עמודות בגיליון — סדר קבוע */
export const CERTIFICATE_SHEET_HEADERS = [
  "שם מלא",
  "תעודת זהות",
  "טלפון",
  "אימייל",
  "שם מארגן הקורס",
  "תאריך הדרכה",
  "חותמת זמן",
  "CRM_PARTICIPANT_ID",
  "נשלחה תעודה במייל",
  "הודפס כרטיס תעודה",
] as const

const COL = {
  fullName: 0,
  idNumber: 1,
  phone: 2,
  email: 3,
  organizer: 4,
  courseDate: 5,
  timestamp: 6,
  crmId: 7,
  emailSent: 8,
  cardPrinted: 9,
} as const

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
  const range = `${tab}!A1:J1`
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })
  const row = existing.data.values?.[0]
  if (row && row.length >= CERTIFICATE_SHEET_HEADERS.length) return

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[...CERTIFICATE_SHEET_HEADERS]] },
  })
}

function participantRow(p: {
  id: string
  fullName: string
  idNumber: string
  phone: string | null
  email: string | null
  organizerName: string | null
  courseDate: string | null
  createdAt: Date
  trainee?: {
    certificateEmailSent: boolean
    certificateCardPrinted: boolean
  } | null
  lead?: {
    fullName: string
    scheduledStart: Date | null
  } | null
}): (string | boolean)[] {
  const courseDate =
    p.courseDate ||
    (p.lead?.scheduledStart
      ? p.lead.scheduledStart.toISOString().slice(0, 10)
      : "")
  return [
    p.fullName || "",
    p.idNumber || "",
    p.phone || "",
    p.email || "",
    p.organizerName || p.lead?.fullName || "",
    courseDate,
    p.createdAt.toISOString(),
    p.id,
    Boolean(p.trainee?.certificateEmailSent),
    Boolean(p.trainee?.certificateCardPrinted),
  ]
}

/** ייצוא משתתפי הדרכה לגיליון (append בלבד, ללא כפילויות לפי CRM_PARTICIPANT_ID) */
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
        lead: { select: { fullName: true, scheduledStart: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    if (!participants.length) return { ok: true, exported: 0 }

    // מזהים שכבר בגיליון
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!H:H`,
    })
    const existingIds = new Set(
      (existing.data.values || [])
        .flat()
        .map((v) => String(v || "").trim())
        .filter((v) => v && v !== "CRM_PARTICIPANT_ID"),
    )

    const toExport = participants.filter(
      (p) => !p.sheetsExportedAt && !existingIds.has(p.id),
    )
    if (!toExport.length) return { ok: true, exported: 0 }

    const values = toExport.map((p) => participantRow(p))
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })

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
      range: `${tab}!A2:J`,
    })
    const rows = res.data.values || []
    let updated = 0
    const touchedLeadIds = new Set<string>()

    for (const row of rows) {
      const participantId = String(row[COL.crmId] || "").trim()
      if (!participantId) continue

      const emailSent = truthyCell(row[COL.emailSent])
      const cardPrinted = truthyCell(row[COL.cardPrinted])
      // קידום חד־כיווני: סימון בגיליון → true ב-CRM (לא מבטלים סימון קיים)
      if (!emailSent && !cardPrinted) continue

      const participant = await prisma.participant.findUnique({
        where: { id: participantId },
        select: {
          id: true,
          leadId: true,
          traineeId: true,
          fullName: true,
          idNumber: true,
          phone: true,
          email: true,
        },
      })
      if (!participant) continue

      let traineeId = participant.traineeId
      if (!traineeId) {
        // יצירת/קישור מודרך אם חסר — כדי לשמור דגלי תעודות
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
          },
          update: {
            ...(emailSent ? { certificateEmailSent: true } : {}),
            ...(cardPrinted ? { certificateCardPrinted: true } : {}),
          },
        })
        traineeId = trainee.id
        await prisma.participant.update({
          where: { id: participant.id },
          data: { traineeId },
        })
        updated++
        touchedLeadIds.add(participant.leadId)
        continue
      }

      const trainee = await prisma.trainee.findUnique({
        where: { id: traineeId },
        select: {
          certificateEmailSent: true,
          certificateCardPrinted: true,
        },
      })
      if (!trainee) continue

      const patch: {
        certificateEmailSent?: boolean
        certificateCardPrinted?: boolean
      } = {}
      if (emailSent && !trainee.certificateEmailSent) {
        patch.certificateEmailSent = true
      }
      if (cardPrinted && !trainee.certificateCardPrinted) {
        patch.certificateCardPrinted = true
      }
      if (!Object.keys(patch).length) continue

      await prisma.trainee.update({
        where: { id: traineeId },
        data: patch,
      })
      updated++
      touchedLeadIds.add(participant.leadId)
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
