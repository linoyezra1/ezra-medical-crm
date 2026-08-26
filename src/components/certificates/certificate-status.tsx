"use client"

import { CheckCircle2, Clock } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type CertificateKind = "digital" | "physical"

const LABELS = {
  digital: {
    title: "תעודה דיגיטלית",
    done: "הונפקה",
    pending: "טרם הונפקה",
  },
  physical: {
    title: "תעודה פיזית",
    done: "הודפסה",
    pending: "טרם הודפסה",
  },
} as const

/** תג סטטוס ויזואלי — ירוק אם הונפק/הודפס, אפור אם ממתין */
export function CertificateStatusBadge({
  kind,
  done,
  className,
}: {
  kind: CertificateKind
  done: boolean
  className?: string
}) {
  const label = LABELS[kind]
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
        done
          ? "bg-emerald-50 text-emerald-800"
          : "bg-secondary text-muted-foreground",
        className,
      )}
      title={`${label.title}: ${done ? label.done : label.pending}`}
    >
      {done ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Clock className="size-3.5 shrink-0 opacity-70" />
      )}
      <span className="truncate">{done ? label.done : label.pending}</span>
    </span>
  )
}

/** שורת סטטוס לתעודה — תג + צ׳קבוקס לעדכון מיידי */
export function CertificateStatusRow({
  kind,
  done,
  onToggle,
  disabled,
}: {
  kind: CertificateKind
  done: boolean
  onToggle?: (next: boolean) => void
  disabled?: boolean
}) {
  const label = LABELS[kind]
  const interactive = Boolean(onToggle) && !disabled

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-foreground">{label.title}</p>
        <CertificateStatusBadge kind={kind} done={done} />
      </div>
      {interactive ? (
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <Checkbox
            checked={done}
            onCheckedChange={(v) => onToggle?.(Boolean(v))}
            aria-label={label.title}
          />
          {done ? label.done : label.pending}
        </label>
      ) : (
        <p className="shrink-0 text-[10px] text-muted-foreground">
          מתעדכן מ-Sheets
        </p>
      )}
    </div>
  )
}

export function CertificateStatusSection({
  digitalDone,
  physicalDone,
  onToggleDigital,
  onTogglePhysical,
  disabled,
}: {
  digitalDone: boolean
  physicalDone: boolean
  onToggleDigital?: (next: boolean) => void
  onTogglePhysical?: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-foreground">סטטוס תעודות</p>
      <CertificateStatusRow
        kind="digital"
        done={digitalDone}
        onToggle={onToggleDigital}
        disabled={disabled}
      />
      <CertificateStatusRow
        kind="physical"
        done={physicalDone}
        onToggle={onTogglePhysical}
        disabled={disabled}
      />
    </div>
  )
}
