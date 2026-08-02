/** אזור זמן קבוע לכל תאריכי/שעות הדרכה ב־CRM */
export const APP_TIMEZONE = "Asia/Jerusalem"

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

type TzParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getTzParts(date: Date, timeZone: string = APP_TIMEZONE): TzParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0"

  let hour = Number(get("hour"))
  // חלק מהמנועים מחזירים 24 לחצות
  if (hour === 24) hour = 0

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  }
}

function normalizeTime(time: string): string {
  const trimmed = time.trim()
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed
  return trimmed
}

/**
 * המרת תאריך+שעה כשעון קיר בישראל → Date (UTC instant).
 * לא משתמש ב־`new Date("YYYY-MM-DDTHH:mm")` שתלוי באזור המכונה.
 */
export function jerusalemLocalToUtcDate(date: string, time: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  const timeNorm = normalizeTime(time)
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeNorm)
  if (!dateMatch || !timeMatch) return new Date(NaN)

  const y = Number(dateMatch[1])
  const mo = Number(dateMatch[2])
  const d = Number(dateMatch[3])
  const h = Number(timeMatch[1])
  const mi = Number(timeMatch[2])
  const s = Number(timeMatch[3] || "0")

  // ניחוש ראשוני כ־UTC, ואז תיקון לפי ההפרש מול Asia/Jerusalem
  let utcMs = Date.UTC(y, mo - 1, d, h, mi, s)
  for (let i = 0; i < 4; i++) {
    const p = getTzParts(new Date(utcMs), APP_TIMEZONE)
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const wanted = Date.UTC(y, mo - 1, d, h, mi, s)
    const diff = wanted - asIfUtc
    if (diff === 0) break
    utcMs += diff
  }
  return new Date(utcMs)
}

/** ISO UTC שמייצג את השעה המקומית בישראל */
export function jerusalemLocalToISO(date: string, time: string): string {
  return jerusalemLocalToUtcDate(date, time).toISOString()
}

/** פירוק Date/ISO לתאריך+שעה לפי שעון ישראל */
export function formatInJerusalem(
  value: Date | string | null | undefined,
): { date?: string; time?: string } {
  if (value == null || value === "") return {}
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return {}
  const p = getTzParts(d, APP_TIMEZONE)
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  }
}

/** ערך ל־datetime-local לפי שעון ישראל */
export function jerusalemDatetimeLocalValue(
  value: Date | string | null | undefined,
): string {
  const { date, time } = formatInJerusalem(value)
  if (!date || !time) return ""
  return `${date}T${time}`
}

/** מחרוזת DTSTART/DTEND ל־ICS בשעון קיר (ללא המרה) */
export function toIcsJerusalemWall(date: string, time: string): string {
  const t = normalizeTime(time).replace(/:/g, "")
  return `${date.replace(/-/g, "")}T${t}`
}
