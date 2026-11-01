import { v2 as cloudinary } from "cloudinary"
import { certError, certLog } from "@/lib/certificate-issuance-log"

export type CloudinaryUploadResult =
  | { ok: true; url: string; publicId: string }
  | { ok: false; error: string }

let configured = false

function ensureCloudinaryConfig(): { ok: true } | { ok: false; error: string } {
  if (configured) return { ok: true }

  const url = process.env.CLOUDINARY_URL?.trim()
  if (url) {
    // ה־SDK קורא את CLOUDINARY_URL מהסביבה אוטומטית
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

/** public_id בטוח ל־Cloudinary — כולל סיומת .pdf בסוף (חובה ל־URL תקין) */
function toPublicIdWithPdf(fileName: string): string {
  const withoutExt = fileName.replace(/\.pdf$/i, "")
  const base =
    withoutExt
      .replace(/[^\w\u0590-\u05FF\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 180) || `certificate_${Date.now()}`
  return `${base}.pdf`
}

/** מבטיח שה־URL הציבורי מסתיים ב־.pdf */
function ensurePdfUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (/\.pdf($|\?)/i.test(trimmed)) return trimmed
  // raw URL בלי סיומת — מוסיפים .pdf לפני query אם יש
  const q = trimmed.indexOf("?")
  if (q === -1) return `${trimmed}.pdf`
  return `${trimmed.slice(0, q)}.pdf${trimmed.slice(q)}`
}

/**
 * מעלה PDF תעודה ל־Cloudinary כ־raw ומחזיר secure_url ציבורי שמסתיים ב־.pdf.
 */
export async function uploadCertificatePdfToCloudinary(input: {
  pdfBytes: Uint8Array
  fileName: string
}): Promise<CloudinaryUploadResult> {
  const cfg = ensureCloudinaryConfig()
  if (!cfg.ok) return cfg

  const fileName =
    String(input.fileName || "certificate.pdf").trim() || "certificate.pdf"
  const folder = certificatesFolder()
  const publicId = `${folder}/${toPublicIdWithPdf(fileName)}`
  const bytes = Buffer.from(input.pdfBytes)
  const dataUri = `data:application/pdf;base64,${bytes.toString("base64")}`

  certLog("cloudinary:upload-start", "מעלה PDF ל־Cloudinary", {
    fileName,
    folder,
    publicId,
    bytes: bytes.length,
  })

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: "raw",
      public_id: publicId,
      format: "pdf",
      overwrite: true,
      invalidate: true,
      type: "upload",
    })

    let url = (result.secure_url || result.url || "").trim()
    if (!url) {
      certError("cloudinary:upload", "העלאה ללא URL", undefined, {
        fileName,
        publicId,
      })
      return { ok: false, error: "העלאה ל־Cloudinary הצליחה ללא URL" }
    }
    url = ensurePdfUrl(url)

    certLog("cloudinary:upload-ok", "העלאה ל־Cloudinary הצליחה", {
      publicId: result.public_id,
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
