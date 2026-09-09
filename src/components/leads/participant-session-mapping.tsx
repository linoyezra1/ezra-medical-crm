import { formatDate } from "@/lib/helpers"
import type { ParticipantSessionAssignment } from "@/lib/participant-session"

const SHOWN_SESSIONS = [1, 2] as const

/**
 * האם יש מה להציג — תגית ״מפגש X״ קיימת (יותר מהדרכה אחת)
 * והמודרך הנוכחי מסומן ״מפגש 1״ או ״מפגש 2״.
 */
export function hasParticipantSessionMapping(
  assignments?: ParticipantSessionAssignment[] | null,
  currentParticipantId?: string,
): boolean {
  if (!assignments || assignments.length < 2) return false
  if (!currentParticipantId) return true
  const current = assignments.find(
    (a) => a.participantId === currentParticipantId,
  )
  return Boolean(current && current.sessionNumber <= 2)
}

/**
 * הצגה אינפורמטיבית בלבד בתוך מגירת המודרך:
 * לאיזו הדרכה משויך ״מפגש 1״ ולאיזו ״מפגש 2״ (לפי ת״ז וסדר תאריכים).
 * לא משנה תגיות ולא נתונים — רק מסביר את התגית שכבר מוצגת.
 */
export function ParticipantSessionMapping({
  assignments,
  currentParticipantId,
}: {
  assignments?: ParticipantSessionAssignment[] | null
  currentParticipantId?: string
}) {
  if (!hasParticipantSessionMapping(assignments, currentParticipantId)) {
    return null
  }
  const list = assignments as ParticipantSessionAssignment[]

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
        שיוך מפגשים
      </p>
      <ul className="space-y-0.5 rounded-lg bg-background/60 px-2.5 py-2 text-[11px] text-foreground">
        {SHOWN_SESSIONS.map((n) => {
          const match = list.find((a) => a.sessionNumber === n)
          return (
            <li key={n} className="flex flex-wrap items-baseline gap-1">
              <span className="font-semibold">מפגש {n}:</span>
              {match ? (
                <span>
                  {match.leadName || "הדרכה ללא שם"}
                  {" · "}
                  {match.dateKey ? formatDate(match.dateKey) : "ללא תאריך"}
                </span>
              ) : (
                <span className="text-muted-foreground">לא שובץ</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
