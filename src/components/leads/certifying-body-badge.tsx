import { cn } from "@/lib/utils"

/** תגית «תעודות דרך מי» */
export function CertifyingBodyBadge({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  const text = (value || "").trim()
  if (!text) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    )
  }
  return (
    <span
      className={cn(
        "inline-block max-w-full truncate rounded-lg bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-teal-900 ring-1 ring-teal-200/80",
        className,
      )}
      title={text}
    >
      {text}
    </span>
  )
}
