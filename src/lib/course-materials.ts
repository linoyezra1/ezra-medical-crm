/**
 * קבצי חומרי הדרכה סטטיים מתוך תיקיית public/
 * יש להניח את הקבצים בשורש public בשמות המדויקים להלן.
 */
export const COURSE_MATERIAL_FILES = {
  booklet44Pdf: "חוברת 44 PDF.pdf",
  booklet44WordPrint: "חוברת 44 WORD להדפסה בשחור לבן.docx",
  presentation44Pdf: "מצגת קורס 44 PDF.pdf",
  exam44v1: "מבחן 44 גרסה 1.pdf",
  exam44v2: "מבחן 44 גרסה 2.pdf",
  participantsTable: "פורמט טבלת משתתפים.xlsx",
} as const

export type CourseMaterialKey = keyof typeof COURSE_MATERIAL_FILES

/** בסיס האפליקציה — localhost / Railway */
export function getAppBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  return env || ""
}

/** בונה URL מלא לקובץ ב-public עם קידוד עברית/רווחים */
export function publicFileUrl(
  filename: string,
  baseUrl: string = getAppBaseUrl(),
): string {
  const origin = baseUrl.replace(/\/$/, "")
  const encoded = filename
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `${origin}/${encoded}`
}

export function courseMaterialUrl(
  key: CourseMaterialKey,
  baseUrl?: string,
): string {
  return publicFileUrl(COURSE_MATERIAL_FILES[key], baseUrl)
}

export function booklet44WhatsAppMessage(
  contactName: string,
  fileUrl: string,
): string {
  const name = contactName.trim()
  const greeting = name ? `היי ${name}, ` : "היי, "
  return `${greeting}מצורף קישור להורדת חוברת הדרכה לקורס 44 שעות: ${fileUrl}`
}

export function booklet44Mailto(params: {
  email: string
  contactName: string
  fileUrl: string
}): string {
  const name = params.contactName.trim() || "שלום"
  const subject = "חוברת הדרכה - קורס 44 שעות"
  const body = `שלום ${name},\n\nמצורף קישור להורדת חוברת ההדרכה:\n${params.fileUrl}`
  return `mailto:${params.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
