/**
 * Client-side Excel/CSV parsing for outreach leads import.
 */
import * as XLSX from "xlsx"
import { sanitizePhone } from "@/lib/utils"

export type OutreachImportRow = {
  key: string
  name: string
  phone: string
  organization: string
  city: string
  category: string
  errors: string[]
}

const HEADER_ALIASES: Record<
  "name" | "phone" | "organization" | "city" | "category",
  string[]
> = {
  name: [
    "name",
    "שם",
    "שם הליד",
    "שם מנהלת",
    "מנהלת",
    "איש קשר",
    "full name",
    "fullname",
  ],
  phone: ["phone", "טלפון", "נייד", "פלאפון", "mobile", "tel"],
  organization: [
    "organization",
    "ארגון",
    "שם הארגון",
    "גן",
    "שם הגן",
    "מעון",
    "מוסד",
    "org",
  ],
  city: ["city", "עיר", "יישוב", "town", "location"],
  category: ["category", "קטגוריה", "סוג", "group"],
}

function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-–—]+/g, " ")
}

function mapHeader(
  header: string,
): keyof typeof HEADER_ALIASES | null {
  const n = normalizeHeader(header)
  if (!n) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof typeof HEADER_ALIASES,
    string[],
  ][]) {
    for (const a of aliases) {
      if (n === normalizeHeader(a) || n.includes(normalizeHeader(a))) {
        return field
      }
    }
  }
  return null
}

function cellStr(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

export function parseOutreachImportFile(file: ArrayBuffer): OutreachImportRow[] {
  const workbook = XLSX.read(file, { type: "array", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][]

  if (!rows.length) return []

  const headerRow = (rows[0] || []).map((h) => cellStr(h))
  const colMap: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {}
  headerRow.forEach((h, i) => {
    const field = mapHeader(h)
    if (field && colMap[field] == null) colMap[field] = i
  })

  const out: OutreachImportRow[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const name = cellStr(colMap.name != null ? row[colMap.name] : "")
    const phoneRaw = cellStr(colMap.phone != null ? row[colMap.phone] : "")
    const organization = cellStr(
      colMap.organization != null ? row[colMap.organization] : "",
    )
    const city = cellStr(colMap.city != null ? row[colMap.city] : "")
    const category = cellStr(
      colMap.category != null ? row[colMap.category] : "",
    )
    if (!name && !phoneRaw && !organization && !city && !category) continue

    const phone = sanitizePhone(phoneRaw)
    const errors: string[] = []
    if (!name.trim()) errors.push("חסר שם")
    if (!phone) errors.push("חסר טלפון")
    else if (!/^0\d{8,9}$/.test(phone) && !/^\d{9,15}$/.test(phone)) {
      errors.push("טלפון לא תקין")
    }
    if (!category.trim()) errors.push("חסרה קטגוריה")

    out.push({
      key: `row-${r}`,
      name: name.trim(),
      phone,
      organization: organization.trim(),
      city: city.trim(),
      category: category.trim(),
      errors,
    })
  }
  return out
}

/** מחליף placeholders בתבנית הודעה */
export function fillOutreachTemplate(
  template: string,
  vars: { name?: string; organization?: string; city?: string },
): string {
  return template
    .replaceAll("{name}", vars.name?.trim() || "")
    .replaceAll("{organization}", vars.organization?.trim() || "")
    .replaceAll("{city}", vars.city?.trim() || "")
    .replaceAll("{{name}}", vars.name?.trim() || "")
    .replaceAll("{{organization}}", vars.organization?.trim() || "")
    .replaceAll("{{city}}", vars.city?.trim() || "")
}
