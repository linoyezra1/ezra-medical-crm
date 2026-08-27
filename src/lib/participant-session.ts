/**
 * מספור מפגשים כרונולוגי לפי ת״ז —
 * אותו מודרך בהדרכות שונות: התאריך המוקדם ביותר = מפגש 1.
 */

import {
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity"
import type { Lead } from "@/lib/types"

export type SessionLeadSlice = Pick<Lead, "id" | "date" | "participants">

type RankedAssignment = {
  participantId: string
  idKey: string
  dateKey: string
}

/** YYYY-MM-DD מתאריך משתתף או מתאריך ההדרכה */
export function resolveAssignmentDateKey(
  courseDate: string | null | undefined,
  leadDate: string | null | undefined,
): string {
  const fromParticipant = (courseDate || "").trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromParticipant)) return fromParticipant
  const fromLead = (leadDate || "").trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromLead)) return fromLead
  return ""
}

function collectAssignments(leads: SessionLeadSlice[]): RankedAssignment[] {
  const out: RankedAssignment[] = []
  for (const lead of leads) {
    for (const p of lead.participants || []) {
      const idKey = normalizeParticipantIdNumber(p.idNumber)
      if (!isUsableParticipantIdNumber(idKey)) continue
      // ת״ז זמניות לא נספרות בין הדרכות
      if (idKey.startsWith("temp") || p.idNumber?.startsWith("temp-")) continue
      out.push({
        participantId: p.id,
        idKey,
        dateKey: resolveAssignmentDateKey(p.courseDate, lead.date),
      })
    }
  }
  return out
}

/**
 * מפת participantId → מספר מפגש (1-based) לפי סדר תאריכים לאותה ת״ז.
 * תאריכים חסרים נדחפים לסוף; שוויון תאריך — לפי מזהה משתתף ליציבות.
 */
export function buildParticipantSessionNumbers(
  leads: SessionLeadSlice[],
): Map<string, number> {
  const byId = new Map<string, RankedAssignment[]>()
  for (const a of collectAssignments(leads)) {
    const list = byId.get(a.idKey)
    if (list) list.push(a)
    else byId.set(a.idKey, [a])
  }

  const result = new Map<string, number>()
  for (const list of byId.values()) {
    list.sort((a, b) => {
      const aEmpty = !a.dateKey
      const bEmpty = !b.dateKey
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
      return a.participantId.localeCompare(b.participantId)
    })
    list.forEach((a, i) => {
      result.set(a.participantId, i + 1)
    })
  }
  return result
}

export function getParticipantSessionNumber(
  sessionByParticipantId: Map<string, number>,
  participantId: string,
): number | undefined {
  return sessionByParticipantId.get(participantId)
}

/** מיון הדרכות מודרך לפי תאריך (למסך מודרכים) */
export function sortTrainingsChronologically<
  T extends { participantId: string; courseDate?: string; leadId: string },
>(
  trainings: T[],
  leadDateById: Map<string, string | undefined>,
): T[] {
  return [...trainings].sort((a, b) => {
    const da = resolveAssignmentDateKey(
      a.courseDate,
      leadDateById.get(a.leadId),
    )
    const db = resolveAssignmentDateKey(
      b.courseDate,
      leadDateById.get(b.leadId),
    )
    const aEmpty = !da
    const bEmpty = !db
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
    if (da !== db) return da.localeCompare(db)
    return a.participantId.localeCompare(b.participantId)
  })
}

export function sessionMeetingLabel(n: number): string {
  return `מפגש ${n}`
}
