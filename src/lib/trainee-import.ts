/**
 * Client-side Excel/CSV parsing + flexible Hebrew header mapping
 * for bulk trainee / participant import.
 */

export type TraineeImportField =
  | "fullName"
  | "idNumber"
  | "phone"
  | "email"
  | "organizerName"
  | "trainingDate"
  | "courseType"
  | "satisfaction"
  | "feedback"
  | "interestedInFirstAidKit"

export type TraineeImportRow = {
  /** Stable key for React lists / edits in preview */
  key: string
  fullName: string
  idNumber: string
  phone: string
  email: string
  organizerName: string
  trainingDate: string
  courseType: string
  satisfaction: string
  feedback: string
  interestedInFirstAidKit: string
  /** Optional explicit lead assignment from preview */
  leadId: string
  /** Blocking issues — row cannot be saved */
  errors: string[]
  /** Non-blocking issues — warn but still allow save (e.g. missing ת״ז) */
  warnings: string[]
}

/** Columns that must never be mapped (explicit ignore list) */
const IGNORED_HEADER_PATTERNS = [
  /חוברת/,
  /20\s*שקל/,
  /חותמת/,
  /timestamp/i,
  /חותמת\s*זמן/,
  /מזהה/,
  /^id$/i,
]

type HeaderAlias = { field: TraineeImportField; aliases: string[] }

const HEADER_ALIASES: HeaderAlias[] = [
  {
    field: "fullName",
    aliases: ["שם מלא", "שם משתמש", "שם המשתתף", "שם", "full name", "fullname"],
  },
  {
    field: "idNumber",
    aliases: [
      "מספר תעודת זהות",
      'ת"ז',
      "ת״ז",
      "תז",
      "ת.ז.",
      "ת.ז",
      "מספר זהות",
      "id number",
      "idnumber",
    ],
  },
  {
    field: "phone",
    aliases: ["טלפון", "נייד", "מספר טלפון", "פלאפון", "phone", "mobile"],
  },
  {
    field: "email",
    aliases: ['דוא"ל', "דוא״ל", "מייל", "אימייל", "email", "e-mail"],
  },
  {
    field: "organizerName",
    aliases: [
      "שם מארגן/מזמין הקורס",
      "שם מארגן / מזמין הקורס",
      "שם מארגן",
      "מזמין הקורס",
      "מארגן",
      "organizer",
    ],
  },
  {
    field: "trainingDate",
    aliases: [
      "תאריך ביצוע הקורס",
      "תאריך הקורס",
      "תאריך הדרכה",
      "תאריך",
      "course date",
      "training date",
    ],
  },
  {
    field: "courseType",
    aliases: ["סוג קורס", "סוג ההדרכה", "קורס", "course type", "course"],
  },
  {
    field: "satisfaction",
    aliases: [
      "האם היית מרוצה מההדרכה?",
      "האם היית מרוצה מההדרכה",
      "שביעות רצון מההדרכה",
      "שביעות רצון",
      "satisfaction",
    ],
  },
  {
    field: "feedback",
    aliases: ["משוב על ההדרכה", "משוב", "feedback"],
  },
  {
    field: "interestedInFirstAidKit",
    aliases: [
      "האם היית מעוניין לרכוש תיק עזרה ראשונה?",
      "האם היית מעוניין לרכוש תיק עזרה ראשונה",
      "תיק עזרה ראשונה",
      "התעניינות בתיק",
      "kit interest",
    ],
  },
]

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u200f|\u200e/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function isIgnoredHeader(header: string): boolean {
  const h = normalizeHeader(header)
  return IGNORED_HEADER_PATTERNS.some((re) => re.test(h))
}

function resolveField(header: string): TraineeImportField | null {
  if (isIgnoredHeader(header)) return null
  const n = normalizeHeader(header)
  for (const entry of HEADER_ALIASES) {
    for (const alias of entry.aliases) {
      if (normalizeHeader(alias) === n) return entry.field
    }
  }
  // Soft contains match for long Google-Forms style headers
  for (const entry of HEADER_ALIASES) {
    for (const alias of entry.aliases) {
      const a = normalizeHeader(alias)
      if (a.length >= 4 && (n.includes(a) || a.includes(n))) {
        return entry.field
      }
    }
  }
  return null
}

function cellToString(value: unknown): string {
  if (value == null || value === "") return ""
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (~ days since 1899-12-30)
    if (value > 20000 && value < 80000) {
      const excelEpoch = Date.UTC(1899, 11, 30)
      const ms = excelEpoch + value * 86400000
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) {
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, "0")
        const day = String(d.getUTCDate()).padStart(2, "0")
        return `${y}-${m}-${day}`
      }
    }
    return String(value)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  return String(value).trim()
}

/** Normalize loose kit-interest answers into CRM options when possible */
export function normalizeKitInterest(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  if (/לא/.test(t) && !/כן/.test(t)) return "לא, תודה"
  if (/כן|אשמח|מעוניי/.test(t)) return "כן, אשמח שתחזרו אליי"
  return t
}

export function validateImportRow(
  row: Omit<TraineeImportRow, "errors" | "warnings" | "key"> & { key?: string },
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  if (!row.fullName.trim()) errors.push("חסר שם מלא")
  if (!row.idNumber.trim()) {
    warnings.push("חסרה ת״ז")
  } else if (!/^\d{5,12}$/.test(row.idNumber.trim().replace(/\D/g, ""))) {
    warnings.push("ת״ז לא תקינה")
  }
  return { errors, warnings }
}

export function emptyImportRow(key: string): TraineeImportRow {
  return {
    key,
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    organizerName: "",
    trainingDate: "",
    courseType: "",
    satisfaction: "",
    feedback: "",
    interestedInFirstAidKit: "",
    leadId: "",
    errors: ["חסר שם מלא"],
    warnings: ["חסרה ת״ז"],
  }
}

export function mapSheetRowsToImport(
  matrix: unknown[][],
): { rows: TraineeImportRow[]; mappedHeaders: string[]; ignoredHeaders: string[] } {
  if (!matrix.length) {
    return { rows: [], mappedHeaders: [], ignoredHeaders: [] }
  }

  const headerCells = (matrix[0] || []).map((c) => cellToString(c))
  const colToField: Array<TraineeImportField | null> = headerCells.map((h) =>
    resolveField(h),
  )

  const mappedHeaders: string[] = []
  const ignoredHeaders: string[] = []
  headerCells.forEach((h, i) => {
    if (!h) return
    if (colToField[i]) mappedHeaders.push(`${h} → ${colToField[i]}`)
    else if (isIgnoredHeader(h)) ignoredHeaders.push(h)
    else ignoredHeaders.push(h)
  })

  const rows: TraineeImportRow[] = []
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] || []
    const isBlank = line.every((c) => !cellToString(c))
    if (isBlank) continue

    const base: Omit<TraineeImportRow, "errors" | "warnings" | "key"> = {
      fullName: "",
      idNumber: "",
      phone: "",
      email: "",
      organizerName: "",
      trainingDate: "",
      courseType: "",
      satisfaction: "",
      feedback: "",
      interestedInFirstAidKit: "",
      leadId: "",
    }

    colToField.forEach((field, i) => {
      if (!field) return
      const val = cellToString(line[i])
      if (!val) return
      if (field === "interestedInFirstAidKit") {
        base[field] = normalizeKitInterest(val)
      } else if (field === "idNumber") {
        base[field] = val.replace(/[-\s]/g, "")
      } else {
        base[field] = val
      }
    })

    const key = `row-${r}-${base.idNumber || base.fullName || Math.random()}`
    const { errors, warnings } = validateImportRow(base)
    rows.push({ ...base, key, errors, warnings })
  }

  return { rows, mappedHeaders, ignoredHeaders }
}

export async function parseTraineeImportFile(
  file: File,
): Promise<{
  rows: TraineeImportRow[]
  mappedHeaders: string[]
  ignoredHeaders: string[]
}> {
  const XLSX = await import("xlsx")
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: "array", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { rows: [], mappedHeaders: [], ignoredHeaders: [] }
  }
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][]

  return mapSheetRowsToImport(matrix)
}

/** Leads eligible for trainee assignment (active pipeline — not ended/lost) */
export const ASSIGNABLE_LEAD_STATUSES = [
  "new",
  "closed",
  "pending_certificates",
] as const

/** Matching DB courseStatus values for server-side validation */
export const ASSIGNABLE_LEAD_DB_STATUSES = [
  "new",
  "cold",
  "pending",
  "closed",
  "certificates_pending",
  "completed",
] as const

export function isLeadAssignableForTrainee(status: string): boolean {
  return (ASSIGNABLE_LEAD_STATUSES as readonly string[]).includes(status)
}

const ID_IN_LINE_RE = /(?<!\d)(\d{7,9})(?!\d)/
const EMAIL_IN_LINE_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

/** מפרידי טלפון נפוצים (רווח, מקף רגיל/יוניקוד, מקף עברי) */
const PHONE_SEP = String.raw`[\s\u00a0\u202f\u2007\-\u2010-\u2015\u2212\u05BE\ufe58\ufe63\uff0d]`
const PHONE_SEP_TEST =
  /[\s\u00a0\u202f\u2007\-\u2010-\u2015\u2212\u05BE\ufe58\ufe63\uff0d]/

/**
 * מועמדי טלפון ישראלי — מסודרים מהספציפי לכללי.
 * חשוב: לא לבלוע ת״ז (9 ספרות שמתחילות ב-0) כטלפון.
 * דוגמאות: 050-932-3117 | 0509323117 | +972 50-932-3117 | 972-50-932-3117
 */
const PHONE_CANDIDATE_RES: RegExp[] = [
  // בינלאומי: +972 / 972 / 00972 + נייד 5X
  new RegExp(
    String.raw`(?:\+|00)?972${PHONE_SEP}*0?5\d(?:${PHONE_SEP}?\d{3})(?:${PHONE_SEP}?\d{4})`,
    "i",
  ),
  // נייד מקומי: 05X … (10 ספרות עם/בלי מפרידים)
  new RegExp(
    String.raw`(?<!\d)05\d(?:${PHONE_SEP}?\d{3})(?:${PHONE_SEP}?\d{4})(?!\d)`,
  ),
  // קווי רק כשיש מפריד מפורש (מונע בליעת ת״ז רצופה שמתחילה ב-0)
  new RegExp(
    String.raw`(?<!\d)0\d{1,2}${PHONE_SEP}+\d{3}${PHONE_SEP}?\d{4}(?!\d)`,
  ),
]

/** מסיר תווי כיוון/בקרת יוניקוד / ZWSP שנדבקים בהעתקה מווטסאפ/וויקס */
function stripInvisibleChars(s: string): string {
  return s.replace(
    /[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,
    "",
  )
}

/** נרמול טלפון מיובא לפורמט מקומי (05…) */
export function normalizeImportedPhone(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("00972")) digits = digits.slice(5)
  else if (digits.startsWith("972")) digits = digits.slice(3)
  if (digits.length === 9 && digits.startsWith("5")) {
    digits = `0${digits}`
  }
  // נייד ישראלי טיפוסי: 10 ספרות שמתחילות ב-05
  if (/^05\d{8}$/.test(digits)) return digits
  // קווי / אחר — אם יצא באורך סביר נשמור
  if (digits.length >= 9 && digits.length <= 12) return digits
  return digits
}

function extractPhoneFromLine(
  line: string,
): { phone: string; raw: string } | null {
  type Hit = { raw: string; phone: string; score: number; index: number }
  const hits: Hit[] = []

  for (const re of PHONE_CANDIDATE_RES) {
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
    let m: RegExpExecArray | null
    while ((m = globalRe.exec(line)) !== null) {
      const phone = normalizeImportedPhone(m[0])
      if (!phone || phone.length < 9) continue
      // דחיית "טלפון" שהוא בעצם ת״ז רצופה של 7–9 ספרות בלי מאפייני נייד
      const rawDigits = m[0].replace(/\D/g, "")
      const looksLikeBareId =
        !/[+]|972/i.test(m[0]) &&
        !PHONE_SEP_TEST.test(m[0]) &&
        rawDigits.length <= 9 &&
        !/^05\d{8}$/.test(phone)
      if (looksLikeBareId) continue

      let score = 0
      if (/^05\d{8}$/.test(phone)) score += 10
      if (/(?:\+|00)?972/i.test(m[0])) score += 5
      if (PHONE_SEP_TEST.test(m[0])) score += 1
      hits.push({ raw: m[0], phone, score, index: m.index })
    }
  }

  if (!hits.length) return null
  hits.sort((a, b) => b.score - a.score || a.index - b.index)
  const best = hits[0]
  return { phone: best.phone, raw: best.raw }
}

/**
 * ייבוא חכם מטקסט חופשי — שורה = שם + ת״ז (+ טלפון/אימייל אופציונלי).
 * מדלג על שורות בלי שם ות״ז תקינים.
 */
export function parseParticipantsFromFreeText(
  raw: string,
  opts?: { leadId?: string },
): TraineeImportRow[] {
  const leadId = opts?.leadId?.trim() || ""
  const lines = raw.split(/\r?\n/)
  const rows: TraineeImportRow[] = []
  let idx = 0

  for (const line of lines) {
    let work = stripInvisibleChars(line).replace(/\t/g, " ").trim()
    if (!work) continue

    const emailMatch = work.match(EMAIL_IN_LINE_RE)
    const email = emailMatch?.[0] || ""
    if (email) {
      work = work.replace(email, " ")
    }

    // טלפון לפני ת״ז — כדי שלא ייחשב חלק מהת״ז / לא ייבלע בה
    const phoneHit = extractPhoneFromLine(work)
    const phone = phoneHit?.phone || ""
    if (phoneHit) {
      work = work.replace(phoneHit.raw, " ")
    }

    const idMatch = work.match(ID_IN_LINE_RE)
    if (!idMatch?.[1]) continue
    const idNumber = idMatch[1]

    let namePart = work
    // הסרת ת״ז והערות בסוגריים אחריה (למשל מספר ביטוח לאומי)
    namePart = namePart.replace(
      new RegExp(`${idNumber}\\s*\\([^)]*\\)?`, "g"),
      " ",
    )
    namePart = namePart.replace(new RegExp(idNumber, "g"), " ")
    namePart = namePart
      .replace(/\([^)]*\)/g, " ")
      .replace(/[,;|]+/g, " ")
      .replace(/[-–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    if (!namePart) continue

    const base: Omit<TraineeImportRow, "errors" | "warnings" | "key"> = {
      fullName: namePart,
      idNumber,
      phone,
      email,
      organizerName: "",
      trainingDate: "",
      courseType: "",
      satisfaction: "",
      feedback: "",
      interestedInFirstAidKit: "",
      leadId,
    }
    const { errors, warnings } = validateImportRow(base)
    // בייבוא מטקסט — חובה גם ת״ז (לא רק אזהרה)
    if (!idNumber.trim()) continue
    if (errors.length > 0) continue

    rows.push({
      key: `text-${Date.now()}-${idx++}`,
      ...base,
      errors,
      warnings,
    })
  }

  return rows
}
