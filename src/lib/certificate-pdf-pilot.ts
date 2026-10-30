/**
 * פיילוט הפקת תעודת עזרה ראשונה כ־PDF מקומי (ללא Google / מייל).
 * רקע קבוע + הטבעת טקסט עם Auto-fit לשם.
 */

import { readFile } from "fs/promises"
import path from "path"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { formatSheetDateDdMmYyyy } from "@/lib/google-sheets/sheet-dates"

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

/** צבע טקסט כהה על הרקע הלבן */
const TEXT_COLOR = rgb(0.12, 0.14, 0.18)

export type PilotCertificateFields = {
  fullName: string
  idNumber: string
  courseDate: string
  hoursScope: string
  certificateNumber: string
  validUntil: string
}

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

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  const drawn = preparePdfText(text)
  if (!drawn) return maxSize
  let size = maxSize
  while (size > minSize && font.widthOfTextAtSize(drawn, size) > maxWidth) {
    size -= 0.5
  }
  return size
}

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  opts: {
    centerX: number
    baselineY: number
    maxWidth: number
    maxSize: number
    minSize?: number
  },
) {
  const raw = (text || "").trim()
  if (!raw) return
  const drawn = preparePdfText(raw)
  const size = fitFontSize(
    font,
    raw,
    opts.maxWidth,
    opts.maxSize,
    opts.minSize ?? 11,
  )
  const width = font.widthOfTextAtSize(drawn, size)
  page.drawText(drawn, {
    x: opts.centerX - width / 2,
    y: opts.baselineY,
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
  const datePart = (opts.courseDate || "")
    .replace(/\D/g, "")
    .slice(0, 8)
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

async function loadAssets() {
  const root = process.cwd()
  const [bgBytes, fontBytes] = await Promise.all([
    readFile(path.join(root, "public", "certificates", "regular-blank.png")),
    readFile(path.join(root, "public", "fonts", "NotoSansHebrew-Regular.ttf")),
  ])
  return { bgBytes, fontBytes }
}

/**
 * מיקומים מכוילים יחסית ל־A4 מול תבנית הרקע.
 * y נמדד מתחתית העמוד (מערכת pdf-lib).
 */
function drawCertificatePage(
  page: PDFPage,
  font: PDFFont,
  fields: PilotCertificateFields,
) {
  const cx = A4_WIDTH / 2

  // שם מלא — אזור רחב מתחת ל«הריני לאשר כי»
  drawCentered(page, font, fields.fullName, {
    centerX: cx,
    baselineY: A4_HEIGHT * 0.62,
    maxWidth: A4_WIDTH * 0.72,
    maxSize: 28,
    minSize: 12,
  })

  // מספר זהות (ליד התווית שברקע)
  drawCentered(page, font, fields.idNumber, {
    centerX: cx + 28,
    baselineY: A4_HEIGHT * 0.545,
    maxWidth: A4_WIDTH * 0.42,
    maxSize: 14,
    minSize: 10,
  })

  // תאריך
  drawCentered(page, font, fields.courseDate, {
    centerX: cx + 20,
    baselineY: A4_HEIGHT * 0.445,
    maxWidth: A4_WIDTH * 0.4,
    maxSize: 14,
    minSize: 10,
  })

  // היקף שעות
  drawCentered(page, font, fields.hoursScope, {
    centerX: cx + 36,
    baselineY: A4_HEIGHT * 0.395,
    maxWidth: A4_WIDTH * 0.35,
    maxSize: 14,
    minSize: 10,
  })

  // מספר תעודה
  drawCentered(page, font, fields.certificateNumber, {
    centerX: cx + 28,
    baselineY: A4_HEIGHT * 0.345,
    maxWidth: A4_WIDTH * 0.42,
    maxSize: 13,
    minSize: 9,
  })

  // תוקף עד
  drawCentered(page, font, fields.validUntil, {
    centerX: cx,
    baselineY: A4_HEIGHT * 0.275,
    maxWidth: A4_WIDTH * 0.4,
    maxSize: 14,
    minSize: 10,
  })
}

export async function buildPilotCertificatesPdf(
  pages: PilotCertificateFields[],
): Promise<Uint8Array> {
  if (!pages.length) {
    throw new Error("אין נתונים להפקת תעודה")
  }

  const { bgBytes, fontBytes } = await loadAssets()
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes, { subset: true })
  // הקובץ עלול להיות JPEG עם סיומת .png — מזהים לפי magic bytes
  const bgImage = isPngBytes(bgBytes)
    ? await pdfDoc.embedPng(bgBytes)
    : await pdfDoc.embedJpg(bgBytes)

  for (const fields of pages) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
    page.drawImage(bgImage, {
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
    })
    drawCertificatePage(page, font, fields)
  }

  return pdfDoc.save()
}
