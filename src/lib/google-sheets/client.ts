import { readFileSync, existsSync } from "fs"
import { google, type drive_v3, type sheets_v4 } from "googleapis"

export type GoogleServiceAccount = {
  client_email: string
  private_key: string
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"

function tryParseServiceAccountJson(
  raw: string,
  source: string,
): GoogleServiceAccount | null {
  let text = raw.trim()
  // Railway לפעמים עוטף במירכאות כפולות מיותרות
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1)
  }
  try {
    const parsed = JSON.parse(text) as GoogleServiceAccount
    if (parsed.client_email && parsed.private_key) return parsed
    console.error(
      `[google-sheets] ${source}: חסרים client_email או private_key`,
    )
  } catch {
    console.error(`[google-sheets] ${source} אינו JSON תקין`)
  }
  return null
}

/**
 * תומך ב:
 * - GOOGLE_CREDENTIALS (Railway)
 * - GOOGLE_SERVICE_ACCOUNT_JSON
 * - GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_PATH (נתיב לקובץ)
 */
function loadServiceAccount(): GoogleServiceAccount | null {
  const jsonEnvKeys = [
    "GOOGLE_CREDENTIALS",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
  ] as const

  for (const key of jsonEnvKeys) {
    const raw = process.env[key]?.trim()
    if (!raw) continue
    const parsed = tryParseServiceAccountJson(raw, key)
    if (parsed) return parsed
  }

  const path =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH?.trim()
  if (path && existsSync(path)) {
    try {
      const parsed = JSON.parse(
        readFileSync(path, "utf8"),
      ) as GoogleServiceAccount
      if (parsed.client_email && parsed.private_key) return parsed
      console.error(
        "[google-sheets] קובץ credentials חסר client_email או private_key",
      )
    } catch (err) {
      console.error("[google-sheets] כשל בקריאת קובץ credentials", err)
    }
  }

  return null
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    loadServiceAccount() && process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim(),
  )
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    loadServiceAccount() &&
      (process.env.GOOGLE_DRIVE_CERTIFICATES_FOLDER_ID?.trim() ||
        process.env.GOOGLE_CERTIFICATES_FOLDER_ID?.trim()),
  )
}

export function getCertificatesDriveFolderId(): string {
  const id =
    process.env.GOOGLE_DRIVE_CERTIFICATES_FOLDER_ID?.trim() ||
    process.env.GOOGLE_CERTIFICATES_FOLDER_ID?.trim()
  if (!id) {
    throw new Error(
      "חסר GOOGLE_DRIVE_CERTIFICATES_FOLDER_ID (תיקיית Drive לתעודות)",
    )
  }
  return id
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()
  if (!id) throw new Error("חסר GOOGLE_SHEETS_SPREADSHEET_ID")
  return id
}

export function getSheetTabName(): string {
  return process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || "תעודות"
}

/** טווח A1 עם שם טאב בעברית / תווים מיוחדים */
export function sheetA1(tab: string, a1: string): string {
  const name = (tab || "תעודות").replace(/'/g, "''")
  return `'${name}'!${a1}`
}

function createGoogleAuth(scopes: string[]) {
  const sa = loadServiceAccount()
  if (!sa) {
    throw new Error(
      "חסרים פרטי Google Service Account (GOOGLE_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON / קובץ credentials)",
    )
  }
  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key.replace(/\\n/g, "\n"),
    scopes,
  })
}

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = createGoogleAuth([SHEETS_SCOPE])
  return google.sheets({ version: "v4", auth })
}

/** Sheets + Drive — להפקת תעודות (מספור בגיליון + העלאת PDF) */
export async function getSheetsAndDriveClients(): Promise<{
  sheets: sheets_v4.Sheets
  drive: drive_v3.Drive
}> {
  const auth = createGoogleAuth([SHEETS_SCOPE, DRIVE_SCOPE, DRIVE_FILE_SCOPE])
  return {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
  }
}

export async function getDriveClient(): Promise<drive_v3.Drive> {
  const auth = createGoogleAuth([DRIVE_SCOPE, DRIVE_FILE_SCOPE])
  return google.drive({ version: "v3", auth })
}

/** מספר יסוד לרצף תעודות ב־CRM (לא תלוי ב־Apps Script). ברירת מחדל: 45825 */
export const DEFAULT_CERTIFICATE_START_NUMBER = 45825

export function getCertificateStartNumber(): number {
  const raw = process.env.CERTIFICATE_START_NUMBER?.trim()
  const n = raw ? Number(raw) : DEFAULT_CERTIFICATE_START_NUMBER
  return Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DEFAULT_CERTIFICATE_START_NUMBER
}
