import path from "path"
import { randomUUID } from "crypto"

export const COHORT_DOCS_REL_DIR = "cohort-docs"

export function cohortDocsUploadDir(): string {
  return path.join(process.cwd(), "uploads", COHORT_DOCS_REL_DIR)
}

export function cohortDocStoredPath(relativeUrl: string): string {
  return path.join(process.cwd(), "uploads", relativeUrl)
}

export function sanitizeCohortFileName(name: string): string {
  return String(name ?? "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .slice(0, 120)
}

const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"])

export function isAllowedCohortDocFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext)
}

export function buildStoredFileKey(originalName: string): string {
  const safe = sanitizeCohortFileName(originalName) || "file.xlsx"
  return `${randomUUID()}-${safe}`
}

export function mimeTypeForFileName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  switch (ext) {
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case ".xls":
      return "application/vnd.ms-excel"
    case ".csv":
      return "text/csv"
    default:
      return "application/octet-stream"
  }
}

export type CohortDocumentationRow = {
  id: string
  cohortName: string
  sessionNumber: number | null
  sessionDate: string
  instructorName: string | null
  durationHours: string | null
  notes: string | null
  isPaid: boolean
  paidAmount: number | null
  fileName: string
  fileUrl: string
  driveUrl: string | null
  fileSize: number | null
  leadId: string | null
  createdAt: string
}

/** sessionNumber=0 מסמן קובץ אקסל נוסף בלי מפגש */
export const COHORT_FILE_ONLY_SESSION_NUMBER = 0

export function isCohortFileOnlyRow(row: {
  sessionNumber: number | null
}): boolean {
  return row.sessionNumber === COHORT_FILE_ONLY_SESSION_NUMBER
}

export type CohortDocSummary = {
  cohortName: string
  fileCount: number
  sessionCount: number
  lastSessionDate: string | null
  isPaid: boolean
  paidAmount: number | null
}

export type CohortExcelFile = {
  downloadId: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  driveUrl: string | null
  createdAt: string
  fileOnly: boolean
}

export function cohortDocsDetailHref(cohortName: string): string {
  return `/certificates/cohort-docs/${encodeURIComponent(cohortName)}`
}

export function decodeCohortParam(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function formatCohortFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function uniqueCohortExcelFiles(
  rows: CohortDocumentationRow[],
): CohortExcelFile[] {
  const byUrl = new Map<string, CohortExcelFile>()
  const sorted = [...rows].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
  for (const row of sorted) {
    if (!row.fileUrl || byUrl.has(row.fileUrl)) continue
    byUrl.set(row.fileUrl, {
      downloadId: row.id,
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      fileSize: row.fileSize,
      driveUrl: row.driveUrl,
      createdAt: row.createdAt,
      fileOnly: isCohortFileOnlyRow(row),
    })
  }
  return [...byUrl.values()]
}

export function summarizeCohortDocs(
  rows: CohortDocumentationRow[],
): CohortDocSummary[] {
  const grouped = new Map<string, CohortDocumentationRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.cohortName) ?? []
    list.push(row)
    grouped.set(row.cohortName, list)
  }

  return [...grouped.entries()]
    .map(([cohortName, list]) => {
      const paid = list.find((r) => r.isPaid)
      const sessions = list.filter((r) => !isCohortFileOnlyRow(r))
      const last = [...sessions].sort((a, b) =>
        b.sessionDate.localeCompare(a.sessionDate),
      )[0]
      return {
        cohortName,
        fileCount: uniqueCohortExcelFiles(list).length,
        sessionCount: sessions.length,
        lastSessionDate: last?.sessionDate ?? null,
        isPaid: Boolean(paid),
        paidAmount: paid?.paidAmount ?? null,
      }
    })
    .sort(
      (a, b) =>
        (b.lastSessionDate ?? "").localeCompare(a.lastSessionDate ?? "", "he") ||
        a.cohortName.localeCompare(b.cohortName, "he"),
    )
}

export type CohortSessionDraft = {
  date: string
  timeFrom: string
  timeTo: string
  hours: string
}

export function emptyCohortSessionDraft(): CohortSessionDraft {
  return { date: "", timeFrom: "", timeTo: "", hours: "" }
}

export function formatCohortSessionDuration(input: {
  timeFrom?: string
  timeTo?: string
  hours?: string
}): string | null {
  const from = String(input.timeFrom ?? "").trim()
  const to = String(input.timeTo ?? "").trim()
  const hours = String(input.hours ?? "").trim()
  const parts: string[] = []
  if (from && to) parts.push(`${from}-${to}`)
  else if (from) parts.push(`מ-${from}`)
  else if (to) parts.push(`עד ${to}`)
  if (hours) parts.push(hours)
  return parts.length ? parts.join(" · ") : null
}

/** מפענח durationHours שנשמר ב-DB חזרה לשדות הטופס */
export function parseCohortSessionDuration(
  durationHours: string | null | undefined,
): Pick<CohortSessionDraft, "timeFrom" | "timeTo" | "hours"> {
  const raw = String(durationHours ?? "").trim()
  if (!raw) return { timeFrom: "", timeTo: "", hours: "" }

  const parts = raw.split(" · ")
  const timePart = parts[0] ?? ""
  const hoursPart = parts.slice(1).join(" · ")

  const rangeMatch = timePart.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
  if (rangeMatch) {
    return { timeFrom: rangeMatch[1], timeTo: rangeMatch[2], hours: hoursPart }
  }
  const fromMatch = timePart.match(/^מ-(\d{1,2}:\d{2})$/)
  if (fromMatch) {
    return { timeFrom: fromMatch[1], timeTo: "", hours: hoursPart }
  }
  const toMatch = timePart.match(/^עד (\d{1,2}:\d{2})$/)
  if (toMatch) {
    return { timeFrom: "", timeTo: toMatch[1], hours: hoursPart }
  }
  return { timeFrom: "", timeTo: "", hours: raw }
}
