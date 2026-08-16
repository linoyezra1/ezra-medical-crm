"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatLeadCourseType } from "@/lib/course-type"
import { formatDateWithWeekday } from "@/lib/helpers"
import { LEAD_STATUS_LABELS, type Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leads: Lead[]
  onSelect: (lead: Lead) => void
  actionLabel?: string
}

export function TrainingPickerDialog({
  open,
  onOpenChange,
  leads,
  onSelect,
  actionLabel,
}: Props) {
  const [q, setQ] = useState("")

  const options = useMemo(() => {
    const list = leads.filter(
      (l) => l.status === "new" || l.status === "closed",
    )
    const term = q.trim().toLowerCase()
    const filtered = !term
      ? list
      : list.filter((l) => {
          const hay = [
            l.name,
            l.contactName,
            l.id,
            l.instructor,
            l.address?.city,
            l.date,
            formatLeadCourseType(l),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
          return hay.includes(term)
        })
    return [...filtered].sort((a, b) => {
      const ta = a.date || ""
      const tb = b.date || ""
      return tb.localeCompare(ta)
    })
  }, [leads, q])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQ("")
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85dvh] max-w-[calc(100%-2rem)] flex-col gap-3 rounded-2xl sm:max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle>לאיזו הדרכה לבצע פעולה זו?</DialogTitle>
          {actionLabel ? (
            <p className="text-xs text-muted-foreground">{actionLabel}</p>
          ) : null}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם מזמין, תאריך או קוד הדרכה"
            className="h-10 pr-10 text-sm"
            autoFocus
          />
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
          {options.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              לא נמצאו הדרכות
            </p>
          ) : (
            options.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onSelect(l)
                  setQ("")
                  onOpenChange(false)
                }}
                className={cn(
                  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-right transition-colors",
                  "hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {LEAD_STATUS_LABELS[l.status]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatLeadCourseType(l)}
                  {l.date
                    ? ` · ${formatDateWithWeekday(l.date)}${l.time ? ` ${l.time}` : ""}`
                    : ""}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[l.address?.city, l.instructor].filter(Boolean).join(" · ") ||
                    "—"}
                  <span className="ms-2 font-mono opacity-70" dir="ltr">
                    #{l.id.slice(0, 8)}
                  </span>
                </p>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
