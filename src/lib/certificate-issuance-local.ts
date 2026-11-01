/**
 * הנפקת תעודות מקומית (Scenario A):
 * PDF ב־CRM → העלאה ל־Drive → שמירת URL ב־CRM + עמודה N → מייל דרך Apps Script.
 */

import { prisma } from "@/lib/db"
import {
  buildPilotCertificatesPdf,
  loadCertificateTemplateForPdf,
  type PilotCertificateFields,
} from "@/lib/certificate-pdf-pilot"
import { uploadCertificatePdfToDrive } from "@/lib/google-drive/certificates"
import {
  ensureCertificateDetailsForParticipantIds,
  syncCertificateUrlsForParticipantIds,
  type SheetCertificateDetails,
} from "@/lib/google-sheets/certificates"
import {
  isGoogleDriveConfigured,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"

export type LocalIssuanceItem = {
  crmId: string
  fullName: string
  email: string
  hours: string
  certificateNumber: string
  pdfUrl: string
  reusedExisting: boolean
}

export type LocalIssuanceResult =
  | {
      ok: true
      items: LocalIssuanceItem[]
      generated: number
      reused: number
    }
  | { ok: false; error: string }

function safeFileName(fullName: string, idNumber: string, certNum: string) {
  const base =
    `${fullName || "תעודה"} - ${idNumber || certNum} תעודת מגיש עזרה ראשונה`
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  return `${base || "certificate"}.pdf`
}

async function persistCertificateUrl(crmId: string, pdfUrl: string) {
  const participant = await prisma.participant.findUnique({
    where: { id: crmId },
    select: { id: true, traineeId: true },
  })
  if (participant) {
    await prisma.participant.update({
      where: { id: participant.id },
      data: { certificateUrl: pdfUrl },
    })
    if (participant.traineeId) {
      await prisma.trainee.update({
        where: { id: participant.traineeId },
        data: { certificateUrl: pdfUrl },
      })
    }
    return
  }

  const trainee = await prisma.trainee.findUnique({
    where: { id: crmId },
    select: { id: true },
  })
  if (trainee) {
    await prisma.trainee.update({
      where: { id: trainee.id },
      data: { certificateUrl: pdfUrl },
    })
    await prisma.participant.updateMany({
      where: { traineeId: trainee.id },
      data: { certificateUrl: pdfUrl },
    })
  }
}

/**
 * מפיק PDF מקומי לכל משתתף (או משתמש ב־PDF קיים בעמודה N),
 * מעלה ל־Drive, מעדכן CRM + שיטס.
 */
export async function generateAndUploadCertificatesLocally(input: {
  participantIds: string[]
  templateType: string
}): Promise<LocalIssuanceResult> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: false, error: "Google Sheets לא מוגדר — לא ניתן לתעד תעודות" }
  }
  if (!isGoogleDriveConfigured()) {
    return {
      ok: false,
      error:
        "חסר GOOGLE_DRIVE_CERTIFICATES_FOLDER_ID — יש לשתף את תיקיית התעודות עם ה־Service Account",
    }
  }

  const detailsRes = await ensureCertificateDetailsForParticipantIds(
    input.participantIds,
  )
  if (!detailsRes.ok) return detailsRes

  const byId = new Map<string, SheetCertificateDetails>()
  for (const d of detailsRes.details) byId.set(d.crmId, d)

  const missing = input.participantIds.filter((id) => !byId.has(id))
  if (missing.length) {
    return {
      ok: false,
      error: `לא נמצאו בגיליון אחרי ייצוא: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    }
  }

  const template = await loadCertificateTemplateForPdf(input.templateType)
  const items: LocalIssuanceItem[] = []
  let generated = 0
  let reused = 0

  for (const crmId of input.participantIds) {
    const row = byId.get(crmId)!
    if (!row.fullName) {
      return { ok: false, error: `חסר שם מלא למשתתף ${crmId}` }
    }

    let pdfUrl = row.pdfUrl
    let reusedExisting = false

    if (pdfUrl) {
      reusedExisting = true
      reused++
    } else {
      const fields: PilotCertificateFields = {
        fullName: row.fullName,
        idNumber: row.idNumber,
        courseDate: row.courseDate,
        hoursScope: row.hours,
        certificateNumber: row.certificateNumber,
        validUntil: row.validUntil,
      }
      const pdfBytes = await buildPilotCertificatesPdf([fields], template)
      const upload = await uploadCertificatePdfToDrive({
        pdfBytes,
        fileName: safeFileName(
          row.fullName,
          row.idNumber,
          row.certificateNumber,
        ),
      })
      if (!upload.ok) {
        return {
          ok: false,
          error: `העלאה ל־Drive נכשלה עבור ${row.fullName}: ${upload.error}`,
        }
      }
      pdfUrl = upload.webViewLink
      generated++
    }

    await persistCertificateUrl(crmId, pdfUrl)
    items.push({
      crmId,
      fullName: row.fullName,
      email: row.email,
      hours: row.hours,
      certificateNumber: row.certificateNumber,
      pdfUrl,
      reusedExisting,
    })
  }

  const sync = await syncCertificateUrlsForParticipantIds(
    items.map((i) => i.crmId),
  )
  if (!sync.ok) {
    return {
      ok: false,
      error: `ה־PDF הופק אך עדכון עמודה N נכשל: ${sync.error}`,
    }
  }

  return { ok: true, items, generated, reused }
}
