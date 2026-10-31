/**
 * הפקת תעודת עזרה ראשונה כ־PDF מקומי (ללא Google / מייל).
 * רקע + שדות לפי תבנית עריכה (או ברירת מחדל).
 */

import { readFile } from "fs/promises"
import path from "path"
import fontkit from "@pdf-lib/fontkit"
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib"
import { formatSheetDateDdMmYyyy } from "@/lib/google-sheets/sheet-dates"
import {
  defaultCertificateTemplate,
  normalizeCertificateTemplate,
  pctToPdfX,
  pctToPdfY,
  resolveFieldText,
  type CertificatePreviewFields,
  type CertificateTemplate,
  type CertificateTextElement,
} from "@/lib/certificate-template"

const TEXT_COLOR = rgb(0.12, 0.14, 0.18)

export type PilotCertificateFields = CertificatePreviewFields

/**
 * pdf-lib מצייר LTR — להצגה עברית הופכים מחרוזות עם תווים עבריים.
 * מספרים / תאריכים לטיניים נשארים כמו שהם.
 */
export function preparePdfText(raw: string): string {
  const text = (raw || "").trim()
  if (!text) return ""
  if (!/[\u0590-\u05FF]/.test(text)) return text
  return [...text].reverse().join("")
}

/** מקטין גופן עד שהטקסט נכנס לרוחב השדה (פר תעודה / פר שדה). */
function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  const drawn = preparePdfText(text)
  if (!drawn || maxWidth <= 0) return maxSize
  let lo = minSize
  let hi = maxSize
  let best = minSize
  // חיפוש בינארי — מדויק יותר מירידה ב־0.5
  for (let i = 0; i < 24; i++) {
    const mid = Math.round(((lo + hi) / 2) * 100) / 100
    if (font.widthOfTextAtSize(drawn, mid) <= maxWidth) {
      best = mid
      lo = mid + 0.05
    } else {
      hi = mid - 0.05
    }
    if (lo > hi) break
  }
  return Math.max(minSize, Math.min(maxSize, best))
}

function drawTextElement(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  element: CertificateTextElement,
  fields: PilotCertificateFields,
  pageWidth: number,
  pageHeight: number,
) {
  const raw = resolveFieldText(element, fields)
  if (!raw) return

  const font = element.fontWeight === "bold" ? fonts.bold : fonts.regular
  const drawn = preparePdfText(raw)
  const maxWidth = (pageWidth * Math.max(5, element.maxWidthPct || 40)) / 100
  const maxSize = Math.max(8, Number(element.fontSize) || 14)
  // רצפה נמוכה מספיק לשמות ארוכים — בלי לחתוך ל־…
  const minSize = Math.min(7, Math.max(5, maxSize * 0.35))
  const size = fitFontSize(font, raw, maxWidth, maxSize, minSize)
  const width = font.widthOfTextAtSize(drawn, size)
  const anchorX = pctToPdfX(element.xPct, pageWidth)
  let x = anchorX
  if (element.align === "center") x = anchorX - width / 2
  else if (element.align === "right") x = anchorX - width

  page.drawText(drawn, {
    x,
    y: pctToPdfY(element.yPct, pageHeight, size),
    size,
    font,
    color: TEXT_COLOR,
  })
}

/** תוקף: +2 שנים מתאריך ההדרכה (DD/MM/YYYY או YYYY-MM-DD) */
export function certificateValidUntil(courseDate: string): string {
  const raw = (courseDate || "").trim()
  if (!raw) return ""
  let year: number
  let month: number
  let day: number
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dmy) {
    day = Number(dmy[1])
    month = Number(dmy[2])
    year = Number(dmy[3])
  } else if (ymd) {
    year = Number(ymd[1])
    month = Number(ymd[2])
    day = Number(ymd[3])
  } else {
    const formatted = formatSheetDateDdMmYyyy(raw)
    return certificateValidUntil(formatted || "")
  }
  const d = new Date(year + 2, month - 1, day)
  if (Number.isNaN(d.getTime())) return ""
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function pilotCertificateNumber(opts: {
  courseDate: string
  participantId: string
}): string {
  const datePart = (opts.courseDate || "").replace(/\D/g, "").slice(0, 8)
  const idPart = opts.participantId.replace(/\W/g, "").slice(-6).toUpperCase()
  return `P-${datePart || "DRAFT"}-${idPart || "XXXX"}`
}

function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

function isJpgBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
}

async function embedImageBytes(pdfDoc: PDFDocument, bytes: Uint8Array) {
  if (isPngBytes(bytes)) return pdfDoc.embedPng(bytes)
  if (isJpgBytes(bytes)) return pdfDoc.embedJpg(bytes)
  // ניסיון אחרון — קבצים עם סיומת שגויה
  try {
    return await pdfDoc.embedJpg(bytes)
  } catch {
    return pdfDoc.embedPng(bytes)
  }
}

/**
 * ממיר URL ציבורי (למשל /certificates/regular-blank.png) לנתיב דיסק תחת public/.
 * חשוב: בלינוקס path.isAbsolute('/certificates/...') === true — ולכן אסור
 * לטפל בנתיבי URL שמתחילים ב־/ כנתיבי קבצים מוחלטים.
 */
function publicUrlToDiskPath(url: string): string {
  const clean = String(url || "").trim().split("?")[0]
  if (!clean) {
    return path.join(process.cwd(), "public", "certificates", "regular-blank.png")
  }
  // נתיב Windows מלא בלבד (C:\... או \\share\...)
  if (/^[a-zA-Z]:[\\/]/.test(clean) || clean.startsWith("\\\\")) {
    return clean
  }
  const relative = clean
    .replace(/^\/+/, "")
    .replace(/^public[\\/]/i, "")
  return path.join(process.cwd(), "public", relative)
}

async function loadFontBytes(): Promise<{ regular: Buffer; bold: Buffer }> {
  const root = process.cwd()
  const fontsDir = path.join(root, "public", "fonts")
  const candidatesRegular = [
    path.join(fontsDir, "tahoma.ttf"),
    path.join(fontsDir, "NotoSansHebrew-Regular.ttf"),
  ]
  const candidatesBold = [
    path.join(fontsDir, "tahomabd.ttf"),
    path.join(fontsDir, "tahoma.ttf"),
    path.join(fontsDir, "NotoSansHebrew-Regular.ttf"),
  ]

  async function firstExisting(paths: string[]) {
    for (const p of paths) {
      try {
        return await readFile(p)
      } catch {
        /* try next */
      }
    }
    throw new Error("לא נמצא קובץ פונט לתעודות ב־public/fonts")
  }

  const regular = await firstExisting(candidatesRegular)
  let bold = regular
  try {
    bold = await firstExisting(candidatesBold)
  } catch {
    bold = regular
  }
  return { regular, bold }
}

async function loadTemplateAssets(template: CertificateTemplate) {
  const [bgBytes, fontBytes] = await Promise.all([
    readFile(publicUrlToDiskPath(template.backgroundUrl)),
    loadFontBytes(),
  ])
  return { bgBytes, fontBytes }
}

async function drawCertificatePage(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  template: CertificateTemplate,
  fields: PilotCertificateFields,
  imageCache: Map<string, PDFImage>,
) {
  const pageWidth = template.pageWidth
  const pageHeight = template.pageHeight

  for (const element of template.elements) {
    if (element.kind === "text") {
      drawTextElement(page, fonts, element, fields, pageWidth, pageHeight)
      continue
    }

    try {
      let image = imageCache.get(element.src)
      if (!image) {
        const bytes = await readFile(publicUrlToDiskPath(element.src))
        image = await embedImageBytes(pdfDoc, bytes)
        imageCache.set(element.src, image)
      }
      const width = (pageWidth * Math.max(1, element.widthPct)) / 100
      const height = (pageHeight * Math.max(1, element.heightPct)) / 100
      const x = pctToPdfX(element.xPct, pageWidth)
      const y =
        pageHeight * (1 - Math.min(100, Math.max(0, element.yPct)) / 100) -
        height
      page.drawImage(image, { x, y, width, height })
    } catch (err) {
      console.error("[certificate-pdf] failed to draw image", element.src, err)
    }
  }
}

export async function loadCertificateTemplateForPdf(): Promise<CertificateTemplate> {
  try {
    const {
      certificateTemplateFilePath,
    } = await import("@/lib/certificate-template")
    const raw = await readFile(certificateTemplateFilePath(), "utf8")
    return normalizeCertificateTemplate(JSON.parse(raw))
  } catch {
    return defaultCertificateTemplate()
  }
}

export async function buildPilotCertificatesPdf(
  pages: PilotCertificateFields[],
  templateInput?: CertificateTemplate | null,
): Promise<Uint8Array> {
  if (!pages.length) {
    throw new Error("אין נתונים להפקת תעודה")
  }

  const template = normalizeCertificateTemplate(
    templateInput || (await loadCertificateTemplateForPdf()),
  )
  const { bgBytes, fontBytes } = await loadTemplateAssets(template)
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const regular = await pdfDoc.embedFont(fontBytes.regular, { subset: true })
  const bold = await pdfDoc.embedFont(fontBytes.bold, { subset: true })
  const fonts = { regular, bold }
  const bgImage = await embedImageBytes(pdfDoc, bgBytes)
  const imageCache = new Map<string, PDFImage>()

  for (const fields of pages) {
    const page = pdfDoc.addPage([template.pageWidth, template.pageHeight])
    page.drawImage(bgImage, {
      x: 0,
      y: 0,
      width: template.pageWidth,
      height: template.pageHeight,
    })
    await drawCertificatePage(
      page,
      pdfDoc,
      fonts,
      template,
      fields,
      imageCache,
    )
  }

  return pdfDoc.save()
}
