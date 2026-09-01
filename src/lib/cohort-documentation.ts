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
