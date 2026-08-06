import { readFileSync, existsSync } from "fs"
import { google, type sheets_v4 } from "googleapis"

export type GoogleServiceAccount = {
  client_email: string
  private_key: string
}

function loadServiceAccount(): GoogleServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as GoogleServiceAccount
      if (parsed.client_email && parsed.private_key) return parsed
    } catch {
      console.error("[google-sheets] GOOGLE_SERVICE_ACCOUNT_JSON אינו JSON תקין")
    }
  }

  const path =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH?.trim()
  if (path && existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as GoogleServiceAccount
      if (parsed.client_email && parsed.private_key) return parsed
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

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()
  if (!id) throw new Error("חסר GOOGLE_SHEETS_SPREADSHEET_ID")
  return id
}

export function getSheetTabName(): string {
  return process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || "תעודות"
}

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const sa = loadServiceAccount()
  if (!sa) {
    throw new Error(
      "חסרים פרטי Google Service Account (GOOGLE_SERVICE_ACCOUNT_JSON או GOOGLE_APPLICATION_CREDENTIALS)",
    )
  }
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return google.sheets({ version: "v4", auth })
}
