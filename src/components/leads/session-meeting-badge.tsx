import {
  sessionMeetingLabel,
  shouldShowSessionBadge,
  type ParticipantSessionInfo,
} from "@/lib/participant-session"
import { cn } from "@/lib/utils"

/** תגית קצרה «מפגש X» — מוצגת רק כשיש למודרך יותר מהדרכה אחת במערכת */
export function SessionMeetingBadge({
  session,
  className,
}: {
  session?: ParticipantSessionInfo | null
  className?: string
}) {
  if (!shouldShowSessionBadge(session)) return null
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-bold leading-none text-sky-800",
        className,
      )}
      title={`מפגש ${session.sessionNumber} מתוך ${session.totalSessions} לפי סדר תאריכי ההדרכות של המודרך`}
    >
      {sessionMeetingLabel(session.sessionNumber)}
    </span>
  )
}
