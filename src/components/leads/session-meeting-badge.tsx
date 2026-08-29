import {
  sessionMeetingLabel,
  shouldShowSessionBadge,
  type ParticipantSessionInfo,
} from "@/lib/participant-session"
import { cn } from "@/lib/utils"

/** תגית דינמית: מוצגת רק כשיש יותר מהדרכה אחת — «מפגש X מתוך Y» */
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
        "shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-sky-800",
        className,
      )}
      title={`מפגש ${session.sessionNumber} מתוך ${session.totalSessions} לפי סדר תאריכי ההדרכות של המודרך`}
    >
      {sessionMeetingLabel(session.sessionNumber, session.totalSessions)}
    </span>
  )
}
