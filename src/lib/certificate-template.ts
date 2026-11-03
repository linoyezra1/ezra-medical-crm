import path from "path"

export const CERTIFICATE_PAGE_WIDTH = 595.28
export const CERTIFICATE_PAGE_HEIGHT = 841.89

export const CERTIFICATE_FIELD_KEYS = [
  "fullName",
  "idNumber",
  "courseDate",
  "hoursScope",
  "certificateNumber",
  "validUntil",
  "custom",
] as const

export type CertificateFieldKey = (typeof CERTIFICATE_FIELD_KEYS)[number]

/** שדות שמוצגים למשתמש בעורך — מספר תעודה מוקצה פנימית בהנפקה */
export const CERTIFICATE_EDITOR_FIELD_KEYS = CERTIFICATE_FIELD_KEYS.filter(
  (field) => field !== "certificateNumber",
)

export const CERTIFICATE_FIELD_LABELS: Record<CertificateFieldKey, string> = {
  fullName: "שם מלא",
  idNumber: "תעודת זהות",
  courseDate: "תאריך הדרכה",
  hoursScope: "היקף שעות",
  certificateNumber: "מספר תעודה",
  validUntil: "תוקף עד",
  custom: "טקסט חופשי",
}

/** בתצוגת עורך — המספר האמיתי מוקצה רק בהנפקה (מ־45825+) */
export const CERTIFICATE_NUMBER_PREVIEW_PLACEHOLDER = "—"

export type CertificateTextElement = {
  id: string
  kind: "text"
  field: CertificateFieldKey
  /** טקסט קבוע כש־field=custom */
  customText?: string
  /** אחוז מרוחב העמוד — מרכז / קצה לפי align */
  xPct: number
  /** אחוז מגובה העמוד מלמעלה (כמו CSS) */
  yPct: number
  maxWidthPct: number
  fontSize: number
  fontWeight: "regular" | "bold"
  align: "center" | "right" | "left"
}

export type CertificateImageElement = {
  id: string
  kind: "image"
  /** נתיב ציבורי, למשל /certificates/logo.png */
  src: string
  xPct: number
  yPct: number
  widthPct: number
  heightPct: number
}

export type CertificateElement =
  | CertificateTextElement
  | CertificateImageElement

export type CertificateTemplate = {
  version: 1
  name: string
  backgroundUrl: string
  pageWidth: number
  pageHeight: number
  elements: CertificateElement[]
}

export type CertificatePreviewFields = {
  fullName: string
  idNumber: string
  courseDate: string
  hoursScope: string
  certificateNumber: string
  validUntil: string
}

export const SAMPLE_PREVIEW_FIELDS: CertificatePreviewFields = {
  fullName: "ישראל ישראלי",
  idNumber: "123456789",
  courseDate: "01/01/2026",
  hoursScope: "44 שעות",
  certificateNumber: CERTIFICATE_NUMBER_PREVIEW_PLACEHOLDER,
  validUntil: "01/01/2028",
}

export function defaultCertificateTemplate(): CertificateTemplate {
  return {
    version: 1,
    name: "תעודת עזרה ראשונה",
    backgroundUrl: "/certificates/regular-blank.png",
    pageWidth: CERTIFICATE_PAGE_WIDTH,
    pageHeight: CERTIFICATE_PAGE_HEIGHT,
    elements: [
      {
        id: "field_fullName",
        kind: "text",
        field: "fullName",
        xPct: 50,
        yPct: 38,
        maxWidthPct: 72,
        fontSize: 28,
        fontWeight: "bold",
        align: "center",
      },
      {
        id: "field_idNumber",
        kind: "text",
        field: "idNumber",
        xPct: 54.7,
        yPct: 45.5,
        maxWidthPct: 42,
        fontSize: 14,
        fontWeight: "regular",
        align: "center",
      },
      {
        id: "field_courseDate",
        kind: "text",
        field: "courseDate",
        xPct: 53.4,
        yPct: 55.5,
        maxWidthPct: 40,
        fontSize: 14,
        fontWeight: "regular",
        align: "center",
      },
      {
        id: "field_hoursScope",
        kind: "text",
        field: "hoursScope",
        xPct: 56,
        yPct: 60.5,
        maxWidthPct: 35,
        fontSize: 14,
        fontWeight: "regular",
        align: "center",
      },
      {
        id: "field_certificateNumber",
        kind: "text",
        field: "certificateNumber",
        xPct: 54.7,
        yPct: 65.5,
        maxWidthPct: 42,
        fontSize: 13,
        fontWeight: "regular",
        align: "center",
      },
      {
        id: "field_validUntil",
        kind: "text",
        field: "validUntil",
        xPct: 50,
        yPct: 72.5,
        maxWidthPct: 40,
        fontSize: 14,
        fontWeight: "regular",
        align: "center",
      },
    ],
  }
}

export function certificateTemplateFilePath(
  templateType?: string | null,
): string {
  const type = String(templateType || "")
    .trim()
    .toUpperCase()
  if (type && type !== "REGULAR") {
    return path.join(
      process.cwd(),
      "data",
      `certificate-template-${type.toLowerCase()}.json`,
    )
  }
  return path.join(process.cwd(), "data", "certificate-template.json")
}

/** נתיב ברירת מחדל (REGULAR) — תמיד קיים */
export function certificateTemplateDefaultFilePath(): string {
  return path.join(process.cwd(), "data", "certificate-template.json")
}

export function certificateAssetsDir(): string {
  return path.join(process.cwd(), "public", "certificates", "assets")
}

export function makeCertificateElementId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function newTextElementDraft(
  field: CertificateFieldKey = "fullName",
): CertificateTextElement {
  return {
    id: makeCertificateElementId("text"),
    kind: "text",
    field,
    xPct: 50,
    yPct: 40,
    maxWidthPct: 50,
    fontSize: 16,
    fontWeight: field === "fullName" ? "bold" : "regular",
    align: "center",
    customText: field === "custom" ? "טקסט לדוגמה" : undefined,
  }
}

export function newImageElementDraft(src: string): CertificateImageElement {
  return {
    id: makeCertificateElementId("img"),
    kind: "image",
    src,
    xPct: 10,
    yPct: 8,
    widthPct: 18,
    heightPct: 10,
  }
}

export function resolveFieldText(
  element: CertificateTextElement,
  fields: CertificatePreviewFields,
): string {
  if (element.field === "custom") return String(element.customText || "").trim()
  return String(fields[element.field] || "").trim()
}

export function normalizeCertificateTemplate(
  raw: unknown,
): CertificateTemplate {
  const fallback = defaultCertificateTemplate()
  if (!raw || typeof raw !== "object") return fallback
  const data = raw as Partial<CertificateTemplate>
  const elements = Array.isArray(data.elements)
    ? data.elements.filter(isValidElement)
    : fallback.elements
  return {
    version: 1,
    name: String(data.name || fallback.name).trim() || fallback.name,
    backgroundUrl:
      String(data.backgroundUrl || fallback.backgroundUrl).trim() ||
      fallback.backgroundUrl,
    pageWidth: Number(data.pageWidth) > 0 ? Number(data.pageWidth) : fallback.pageWidth,
    pageHeight:
      Number(data.pageHeight) > 0 ? Number(data.pageHeight) : fallback.pageHeight,
    elements: elements.length ? elements : fallback.elements,
  }
}

function isValidElement(value: unknown): value is CertificateElement {
  if (!value || typeof value !== "object") return false
  const el = value as CertificateElement
  if (!el.id || typeof el.id !== "string") return false
  if (el.kind === "text") {
    return (
      CERTIFICATE_FIELD_KEYS.includes(el.field) &&
      Number.isFinite(el.xPct) &&
      Number.isFinite(el.yPct)
    )
  }
  if (el.kind === "image") {
    return Boolean(el.src) && Number.isFinite(el.xPct) && Number.isFinite(el.yPct)
  }
  return false
}

/**
 * המרת אחוזי עורך (מלמעלה) ל־Y של קצה עליון ב־pdf-lib (מלמטה).
 * את ה־baseline מחשבים בנפרד: topY - ascent.
 */
export function pctToPdfY(yPct: number, pageHeight: number): number {
  return pageHeight * (1 - Math.min(100, Math.max(0, yPct)) / 100)
}

export function pctToPdfX(xPct: number, pageWidth: number): number {
  return (pageWidth * Math.min(100, Math.max(0, xPct))) / 100
}
