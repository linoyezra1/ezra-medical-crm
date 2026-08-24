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

const ID_IN_LINE_RE = /\b(\d{7,9})\b/
const PHONE_IN_LINE_RE = /05\d-?\d{7}/
const EMAIL_IN_LINE_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

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
    const trimmed = line.replace(/\t/g, " ").trim()
    if (!trimmed) continue

    const idMatch = trimmed.match(ID_IN_LINE_RE)
    if (!idMatch?.[1]) continue
    const idNumber = idMatch[1]

    const phoneMatch = trimmed.match(PHONE_IN_LINE_RE)
    const phone = phoneMatch?.[0]?.replace(/-/g, "") || ""

    const emailMatch = trimmed.match(EMAIL_IN_LINE_RE)
    const email = emailMatch?.[0] || ""

    let namePart = trimmed
    // הסרת ת״ז והערות בסוגריים אחריה (למשל מספר ביטוח לאומי)
    namePart = namePart.replace(
      new RegExp(`${idNumber}\\s*\\([^)]*\\)?`, "g"),
      " ",
    )
    namePart = namePart.replace(new RegExp(idNumber, "g"), " ")
    if (phoneMatch?.[0]) {
      namePart = namePart.replace(phoneMatch[0], " ")
    }
    if (email) {
      namePart = namePart.replace(email, " ")
    }
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
