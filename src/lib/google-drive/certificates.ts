import { Readable } from "stream"
import { certError, certLog, certWarn } from "@/lib/certificate-issuance-log"
import {
  getCertificatesDriveFolderId,
  getDriveClient,
  isGoogleDriveConfigured,
} from "@/lib/google-sheets/client"

export type DriveUploadResult =
  | { ok: true; fileId: string; webViewLink: string }
  | { ok: false; error: string }

/**
 * מעלה PDF תעודה לתיקיית Drive המשותפת (אותה תיקייה שהסקריפט משתמש בה).
 * מחזיר webViewLink שתואם ל־getFileFromUrlOrId ב־Apps Script.
 */
export async function uploadCertificatePdfToDrive(input: {
  pdfBytes: Uint8Array
  fileName: string
}): Promise<DriveUploadResult> {
  if (!isGoogleDriveConfigured()) {
    return {
      ok: false,
      error:
        "חסר GOOGLE_DRIVE_CERTIFICATES_FOLDER_ID — יש להגדיר תיקיית Drive לתעודות ולשתף עם ה־Service Account",
    }
  }

  const folderId = getCertificatesDriveFolderId()
  const fileName =
    String(input.fileName || "certificate.pdf").trim() || "certificate.pdf"
  const bytes = Buffer.from(input.pdfBytes)

  certLog("drive:upload-start", "מעלה PDF ל־Drive", {
    fileName,
    folderId,
    bytes: bytes.length,
  })

  try {
    const drive = await getDriveClient()
    const created = await drive.files.create({
      requestBody: {
        name: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
        parents: [folderId],
        mimeType: "application/pdf",
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from(bytes),
      },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    })

    const fileId = created.data.id
    if (!fileId) {
      certError("drive:upload", "העלאה ללא מזהה קובץ", undefined, { fileName })
      return { ok: false, error: "העלאה ל־Drive הצליחה ללא מזהה קובץ" }
    }

    // כמו בסקריפט: קישור לצפייה לכל מי שיש לו את הקישור
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        supportsAllDrives: true,
      })
    } catch (permErr) {
      certWarn("drive:share", "לא ניתן לשתף anyone-with-link", {
        fileId,
        err:
          permErr instanceof Error ? permErr.message : String(permErr),
      })
    }

    const meta = await drive.files.get({
      fileId,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    })
    const webViewLink =
      meta.data.webViewLink?.trim() ||
      `https://drive.google.com/file/d/${fileId}/view`

    certLog("drive:upload-ok", "העלאה ל־Drive הצליחה", {
      fileId,
      webViewLink,
    })
    return { ok: true, fileId, webViewLink }
  } catch (err) {
    certError("drive:upload", "שגיאה בהעלאת PDF ל־Google Drive", err, {
      fileName,
      folderId,
    })
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בהעלאת PDF ל־Google Drive",
    }
  }
}
