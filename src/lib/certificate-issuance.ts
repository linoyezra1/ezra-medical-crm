/** סוגי תבנית תעודה לשליחה ל-Google Apps Script */
export const CERTIFICATE_TEMPLATE_TYPES = [
  { value: "REGULAR", label: "קורס רגיל" },
  { value: "REFRESH", label: "קורס רענון" },
  { value: "SKIPPERS", label: "משיטים" },
  { value: "BLS", label: "BLS" },
] as const

export type CertificateTemplateType =
  (typeof CERTIFICATE_TEMPLATE_TYPES)[number]["value"]

export const DEFAULT_CERTIFICATE_ISSUANCE_PIN = "214215444"
