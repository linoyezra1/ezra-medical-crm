import { formatInJerusalem } from "@/lib/timezone"

/** Epoch של Excel / Google Sheets (ימים מאז 1899-12-30), כולל באג leap של 1900 */
const SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)

/**
 * מפרק ערך תאריך מתא בגיליון / ייבוא:
 * מחרוזת (DD/MM/YYYY, YYYY-MM-DD, ISO), מספר סידורי של Sheets, או Date/timestamp.
 */
export function parseSheetDateValue(value: unknown): Date | null {
  if (value == null || value === "") return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return dateFromNumber(value)
  }

  const raw = String(value).trim()
  if (!raw) return null

  // מספר כמחרוזת (סידורי Sheets או epoch)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return dateFromNumber(Number(raw))
  }

  // DD/MM/YYYY או DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    let year = Number(dmy[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day, 12, 0, 0, 0)
      return Number.isNaN(d.getTime()) ? null : d
    }
  }

  // YYYY-MM-DD (אופציונלי עם זמן)
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) {
    const d = new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      12,
      0,
      0,
      0,
    )
    return Number.isNaN(d.getTime()) ? null : d
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateFromNumber(value: number): Date | null {
  // מספר סידורי של Sheets/Excel (~ ימים מאז 1899-12-30)
  if (value > 20000 && value < 80000) {
    const d = new Date(SHEETS_EPOCH_UTC_MS + value * 86400000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // Unix epoch בשניות
  if (value > 1e9 && value < 1e12) {
    const d = new Date(value * 1000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // Unix epoch במילישניות
  if (value >= 1e12 && value < 1e14) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** פורמט תצוגה לגיליון: DD/MM/YYYY (שעון ישראל) */
export function formatSheetDateDdMmYyyy(value: unknown): string {
  const d = parseSheetDateValue(value)
  if (!d) {
    // אם כבר מחרוזת DD/MM/YYYY תקינה — מחזירים כמו שהיא
    const raw = String(value ?? "").trim()
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) return raw
    return ""
  }
  const { date } = formatInJerusalem(d)
  if (!date) return ""
  const [y, m, day] = date.split("-")
  if (!y || !m || !day) return ""
  return `${day}/${m}/${y}`
}

/** תאריך+שעה לייצוא: DD/MM/YYYY HH:mm */
export function formatSheetDateTimeDdMmYyyy(value: unknown = new Date()): string {
  const d = parseSheetDateValue(value)
  if (!d) return ""
  const { date, time } = formatInJerusalem(d)
  if (!date) return ""
  const [y, m, day] = date.split("-")
  if (!y || !m || !day) return ""
  return `${day}/${m}/${y}${time ? ` ${time}` : ""}`
}
