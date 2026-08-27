import { sessionMeetingLabel } from "@/lib/participant-session"
import { cn } from "@/lib/utils"

/** תגית דינמית: מוצגת רק ממפגש 2 ומעלה (מפגש יחיד — בלי תגית) */
export function SessionMeetingBadge({
  sessionNumber,
  className,
}: {
  sessionNumber: number | undefined | null
  className?: string
}) {
  if (sessionNumber == null || sessionNumber < 2) return null
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-sky-800",
        className,
      )}
      title={`מפגש מספר ${sessionNumber} לפי סדר תאריכי ההדרכות של המודרך`}
    >
      {sessionMeetingLabel(sessionNumber)}
    </span>
  )
}
