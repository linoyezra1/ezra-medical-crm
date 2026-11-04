import { createHash, randomBytes } from "crypto"
import { Readable } from "stream"
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"
import { certError, certLog } from "@/lib/certificate-issuance-log"

export type CloudinaryUploadResult =
  | { ok: true; url: string; publicId: string }
  | { ok: false; error: string }

let configured = false

function ensureCloudinaryConfig(): { ok: true } | { ok: false; error: string } {
  if (configured) return { ok: true }

  const url = process.env.CLOUDINARY_URL?.trim()
  if (url) {
    configured = true
    return { ok: true }
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloudName || !apiKey || !apiSecret) {
    return {
      ok: false,
      error:
        "חסרים פרטי Cloudinary — הגדירו CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (או CLOUDINARY_URL)",
    }
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })
  configured = true
  return { ok: true }
}

export function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL?.trim()) return true
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  )
}

function certificatesFolder(): string {
  return (
    process.env.CLOUDINARY_CERTIFICATES_FOLDER?.trim() || "ezra-certificates"
  )
}

/**
 * public_id באנגלית בלבד — עברית ב־URL שוברת הורדה ב־Apps Script / דפדפן.
 * בלי סיומת .pdf: PDF מועלה כ־image (המלצת Cloudinary) והסיומת מתווספת ב־delivery.
 */
function toAsciiPublicId(input: {
  fileName: string
  certificateNumber?: string
}): string {
  const cert =
    String(input.certificateNumber || "")
      .replace(/\D/g, "")
      .slice(0, 12) || "cert"
  const digitsFromName = input.fileName.replace(/\D/g, "").slice(-10)
  const stamp = Date.now()
  const rand = randomBytes(3).toString("hex")
  const hash = createHash("sha1")
    .update(input.fileName)
    .digest("hex")
    .slice(0, 6)
  const base = [cert, digitsFromName || hash, stamp, rand]
    .filter(Boolean)
    .join("-")
  return base
}

function uploadBuffer(
  bytes: Buffer,
  options: Record<string, unknown>,
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => {
        if (err || !result) {
          reject(err || new Error("Cloudinary upload ללא תוצאה"))
          return
        }
        resolve(result)
      },
    )
    Readable.from(bytes).pipe(stream)
  })
}

/**
 * מעלה תמונת רקע/לוגו לתבנית תעודה — כדי שישרוד דיפלוי (לא רק public/ המקומי).
 */
export async function uploadCertificateAssetImageToCloudinary(input: {
  bytes: Buffer
  fileName: string
}): Promise<CloudinaryUploadResult> {
  const cfg = ensureCloudinaryConfig()
  if (!cfg.ok) return cfg

  const folder = `${certificatesFolder()}/assets`
  const stamp = Date.now()
  const rand = randomBytes(3).toString("hex")
  const safe = String(input.fileName || "asset")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "")
    .slice(0, 24) || "asset"
  const publicId = `${folder}/${safe}-${stamp}-${rand}`

  try {
    const result = await uploadBuffer(input.bytes, {
      resource_type: "image",
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      unique_filename: false,
      use_filename: false,
      type: "upload",
    })
    const url = (result.secure_url || result.url || "").trim()
    if (!url) {
      return { ok: false, error: "העלאת תמונה ל־Cloudinary ללא URL" }
    }
    return {
      ok: true,
      url,
      publicId: String(result.public_id || publicId),
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בהעלאת תמונה ל־Cloudinary",
    }
  }
}

/**
 * מעלה PDF ל־Cloudinary כ־image/pdf עם public_id ASCII בלבד.
 * מחזיר secure_url ציבורי שניתן להורדה ב־UrlFetchApp / דפדפן.
 */
export async function uploadCertificatePdfToCloudinary(input: {
  pdfBytes: Uint8Array
  fileName: string
  certificateNumber?: string
}): Promise<CloudinaryUploadResult> {
  const cfg = ensureCloudinaryConfig()
  if (!cfg.ok) return cfg

  const fileName =
    String(input.fileName || "certificate.pdf").trim() || "certificate.pdf"
  const folder = certificatesFolder()
  const publicId = `${folder}/${toAsciiPublicId({
    fileName,
    certificateNumber: input.certificateNumber,
  })}`
  const bytes = Buffer.from(input.pdfBytes)

  certLog("cloudinary:upload-start", "מעלה PDF ל־Cloudinary", {
    fileName,
    folder,
    publicId,
    bytes: bytes.length,
  })

  try {
    // PDF כ־image — URL יציב יותר מ־raw עם עברית ב־public_id
    const result = await uploadBuffer(bytes, {
      resource_type: "image",
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      unique_filename: false,
      use_filename: false,
      format: "pdf",
      type: "upload",
    })

    const url = (result.secure_url || result.url || "").trim()
    if (!url) {
      certError("cloudinary:upload", "העלאה ללא URL", undefined, {
        fileName,
        publicId,
      })
      return { ok: false, error: "העלאה ל־Cloudinary הצליחה ללא URL" }
    }

    // וידוא בסיסי שהקישור נראה כמו PDF של Cloudinary
    if (!/res\.cloudinary\.com\//i.test(url)) {
      certError("cloudinary:upload", "URL לא נראה כמו Cloudinary", undefined, {
        url,
      })
      return { ok: false, error: `URL לא תקין מ־Cloudinary: ${url}` }
    }

    certLog("cloudinary:upload-ok", "העלאה ל־Cloudinary הצליחה", {
      publicId: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      url,
    })
    return {
      ok: true,
      url,
      publicId: String(result.public_id || publicId),
    }
  } catch (err) {
    certError("cloudinary:upload", "שגיאה בהעלאת PDF ל־Cloudinary", err, {
      fileName,
      folder,
      publicId,
    })
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בהעלאת PDF ל־Cloudinary",
    }
  }
}
