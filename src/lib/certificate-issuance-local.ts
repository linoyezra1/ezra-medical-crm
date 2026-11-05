/**
 * הנפקת תעודות מקומית (Scenario A):
 * תמיד PDF חדש מהתבנית השמורה בעורך → Cloudinary → CRM + עמודה N → מייל ב־Apps Script.
 */

import { prisma } from "@/lib/db"
import {
  certError,
  certLog,
  certWarn,
} from "@/lib/certificate-issuance-log"
import {
  buildPilotCertificatesPdf,
  loadCertificateTemplateForPdf,
  type PilotCertificateFields,
} from "@/lib/certificate-pdf-pilot"
import {
  isCloudinaryConfigured,
  uploadCertificatePdfToCloudinary,
} from "@/lib/cloudinary/certificates"
import {
  ensureCertificateDetailsForParticipantIds,
  resetCertificateEmailSentInSheet,
  syncCertificateUrlsForParticipantIds,
  type SheetCertificateDetails,
} from "@/lib/google-sheets/certificates"
import { isGoogleSheetsConfigured } from "@/lib/google-sheets/client"
import { formatCertificateHoursScope } from "@/lib/course-type"

export type LocalIssuanceItem = {
  crmId: string
  fullName: string
  email: string
  hours: string
  certificateNumber: string
  pdfUrl: string
}

export type LocalIssuanceResult =
  | {
      ok: true
      items: LocalIssuanceItem[]
      generated: number
    }
  | { ok: false; error: string }

function safeFileName(fullName: string, idNumber: string, _certNum?: string) {
  const name = String(fullName || "תעודה")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const id = String(idNumber || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const base = id
    ? `${name} - ${id} - תעודת מגיש עזרה ראשונה`
    : `${name} - תעודת מגיש עזרה ראשונה`
  return `${base}.pdf`
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
 * תמיד מפיק PDF חדש לפי התבנית האחרונה בעורך.
 * גם אם עמודה N ריקה (נמחק ידנית בשיטס) או שיש קישור ישן ב־CRM —
 * נוצר PDF חדש ב־Cloudinary, נכתב ל־N, ואז נשלח מייל.
 */
export async function generateAndUploadCertificatesLocally(input: {
  participantIds: string[]
  templateType: string
}): Promise<LocalIssuanceResult> {
  certLog("pdf:start", "התחלת הפקה מקומית (תמיד PDF חדש)", {
    count: input.participantIds.length,
    templateType: input.templateType,
    ids: input.participantIds.slice(0, 20),
  })

  if (!isGoogleSheetsConfigured()) {
    certError("pdf:config", "Google Sheets לא מוגדר")
    return { ok: false, error: "Google Sheets לא מוגדר — לא ניתן לתעד תעודות" }
  }
  if (!isCloudinaryConfigured()) {
    certError("pdf:config", "חסרים פרטי Cloudinary")
    return {
      ok: false,
      error:
        "חסרים פרטי Cloudinary — הגדירו CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET",
    }
  }

  // אחרי append לשיטס לפעמים הקריאה המיידית עדיין לא רואה את השורה — ניסיון חוזר קצר
  let detailsRes = await ensureCertificateDetailsForParticipantIds(
    input.participantIds,
  )
  if (!detailsRes.ok) {
    certError("sheets:details", detailsRes.error)
    return detailsRes
  }
  for (
    let attempt = 0;
    attempt < 3 && detailsRes.ok && detailsRes.missingRequestIds.length > 0;
    attempt++
  ) {
    certWarn("sheets:details-retry", "מזהים חסרים בגיליון — מנסים שוב", {
      attempt: attempt + 1,
      missing: detailsRes.missingRequestIds,
    })
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    detailsRes = await ensureCertificateDetailsForParticipantIds(
      input.participantIds,
    )
    if (!detailsRes.ok) {
      certError("sheets:details", detailsRes.error)
      return detailsRes
    }
  }

  if (detailsRes.missingRequestIds.length) {
    certError("sheets:missing", "לא נמצאו בגיליון אחרי ייצוא", {
      missing: detailsRes.missingRequestIds,
    })
    return {
      ok: false,
      error: `לא נמצאו בגיליון אחרי ייצוא: ${detailsRes.missingRequestIds
        .slice(0, 5)
        .join(", ")}${detailsRes.missingRequestIds.length > 5 ? "…" : ""}`,
    }
  }

  if (!detailsRes.details.length) {
    certError("sheets:empty", "אין שורות תואמות בגיליון")
    return {
      ok: false,
      error: "לא נמצאו שורות תואמות בגיליון להפקת תעודה",
    }
  }

  certLog("sheets:details-ok", "פרטי גיליון מוכנים", {
    rows: detailsRes.details.map((d) => ({
      crmId: d.crmId,
      rowIndex: d.rowIndex,
      fullName: d.fullName,
      email: d.email ? "(יש)" : "(חסר)",
      certificateNumber: d.certificateNumber,
    })),
  })

  // שורה אחת בגיליון = תעודה אחת (גם אם ביקשו גם trainee וגם participant)
  const uniqueRows = new Map<number, SheetCertificateDetails>()
  for (const d of detailsRes.details) {
    if (!uniqueRows.has(d.rowIndex)) uniqueRows.set(d.rowIndex, d)
  }

  const template = await loadCertificateTemplateForPdf(input.templateType)
  certLog("pdf:template", "נטענה תבנית", {
    templateType: input.templateType,
    name: template.name,
    backgroundUrl: template.backgroundUrl,
    elements: template.elements.length,
  })

  const items: LocalIssuanceItem[] = []
  let generated = 0

  for (const row of uniqueRows.values()) {
    if (!row.fullName) {
      certError("pdf:row", "חסר שם מלא", { crmId: row.crmId })
      return { ok: false, error: `חסר שם מלא למשתתף ${row.crmId}` }
    }

    const hadSheetPdf = Boolean(row.pdfUrl?.trim())
    certLog("pdf:build", "בונה PDF חדש", {
      crmId: row.crmId,
      fullName: row.fullName,
      certificateNumber: row.certificateNumber,
      hasEmail: Boolean(row.email),
      reissueAfterClearedN: !hadSheetPdf,
      previousSheetPdf: hadSheetPdf ? "(היה קישור ב־N — מוחלף)" : "(N ריק)",
    })

    try {
      const fields: PilotCertificateFields = {
        fullName: row.fullName,
        idNumber: row.idNumber,
        courseDate: row.courseDate,
        hoursScope: formatCertificateHoursScope(row.hours),
        certificateNumber: row.certificateNumber,
        validUntil: row.validUntil,
      }
      const pdfBytes = await buildPilotCertificatesPdf([fields], template)
      certLog("pdf:built", "PDF נוצר", {
        crmId: row.crmId,
        bytes: pdfBytes.length,
      })

      const upload = await uploadCertificatePdfToCloudinary({
        pdfBytes,
        fileName: safeFileName(
          row.fullName,
          row.idNumber,
          row.certificateNumber,
        ),
        certificateNumber: row.certificateNumber,
      })
      if (!upload.ok) {
        certError("cloudinary:upload", upload.error, undefined, {
          crmId: row.crmId,
          fullName: row.fullName,
        })
        return {
          ok: false,
          error: `העלאה ל־Cloudinary נכשלה עבור ${row.fullName}: ${upload.error}`,
        }
      }

      certLog("cloudinary:uploaded", "הועלה ל־Cloudinary", {
        crmId: row.crmId,
        publicId: upload.publicId,
        url: upload.url,
      })

      const pdfUrl = upload.url
      generated++
      await persistCertificateUrl(row.crmId, pdfUrl)
      items.push({
        crmId: row.crmId,
        fullName: row.fullName,
        email: row.email,
        hours: row.hours,
        certificateNumber: row.certificateNumber,
        pdfUrl,
      })
    } catch (err) {
      certError("pdf:exception", "כשל בהפקת/העלאת תעודה", err, {
        crmId: row.crmId,
        fullName: row.fullName,
      })
      return {
        ok: false,
        error:
          err instanceof Error
            ? `שגיאה בהפקת תעודה עבור ${row.fullName}: ${err.message}`
            : `שגיאה בהפקת תעודה עבור ${row.fullName}`,
      }
    }
  }

  const issuedIds = items.map((i) => i.crmId)

  const sync = await syncCertificateUrlsForParticipantIds(issuedIds)
  if (!sync.ok) {
    certError("sheets:sync-url", sync.error, undefined, {
      crmIds: issuedIds,
    })
    return {
      ok: false,
      error: `ה־PDF הופק אך עדכון עמודה N נכשל: ${sync.error}`,
    }
  }

  // מאפשר שליחה מחדש אחרי מחיקת N / הנפקה חוזרת
  const resetJ = await resetCertificateEmailSentInSheet(issuedIds)
  if (!resetJ.ok) {
    certWarn("sheets:reset-j", resetJ.error, { crmIds: issuedIds })
  }

  certLog("pdf:done", "הפקה מקומית הושלמה — מוכן לשליחת מייל", {
    generated,
    updatedSheetUrls: sync.updated,
    resetEmailFlags: resetJ.ok ? resetJ.updated : 0,
    items: items.map((i) => ({
      crmId: i.crmId,
      fullName: i.fullName,
      hasEmail: Boolean(i.email),
      certificateNumber: i.certificateNumber,
    })),
  })

  return { ok: true, items, generated }
}
