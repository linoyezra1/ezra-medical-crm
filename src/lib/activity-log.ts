import {
  dbStatusToUi,
  LEAD_STATUS_LABELS,
  type ActivityLogEntry,
  type LeadStatus,
} from "@/lib/types"
import { formatInJerusalem } from "@/lib/timezone"

function statusLabel(dbOrUi: string | undefined | null): string {
  if (!dbOrUi) return "—"
  const ui = dbStatusToUi(dbOrUi)
  if (LEAD_STATUS_LABELS[ui as LeadStatus]) {
    return LEAD_STATUS_LABELS[ui as LeadStatus]
  }
  // already a UI status key
  if (LEAD_STATUS_LABELS[dbOrUi as LeadStatus]) {
    return LEAD_STATUS_LABELS[dbOrUi as LeadStatus]
  }
  return dbOrUi
}

function formatActivityWhen(iso: string): string {
  const { date, time } = formatInJerusalem(iso)
  if (!date) return ""
  const [y, m, d] = date.split("-")
  return `${d}/${m}/${y}${time ? ` ${time}` : ""}`
}

/** שורת תצוגה להיסטוריית שינויים */
export function formatActivityLogLine(entry: ActivityLogEntry): string {
  const when = formatActivityWhen(entry.createdAt)
  const who = entry.performedBy || "משתמש"
  if (!entry.previousStatus) {
    return `${who} יצר את הליד (סטטוס: '${statusLabel(entry.newStatus)}')${when ? ` ב-${when}` : ""}`
  }
  return `${who} שינה סטטוס מ-'${statusLabel(entry.previousStatus)}' ל-'${statusLabel(entry.newStatus)}'${when ? ` ב-${when}` : ""}`
}
