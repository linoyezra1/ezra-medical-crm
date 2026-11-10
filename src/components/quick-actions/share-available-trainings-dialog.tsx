"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, MessageCircle, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatLeadCourseType } from "@/lib/course-type"
import {
  formatDate,
  weekdayNameHe,
  whatsappLink,
} from "@/lib/helpers"
import {
  leadCalendarSessions,
  sessionLocationLabel,
} from "@/lib/payment"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leads: Lead[]
}

/** שורת הודעה: תאריך | יום | שעה | עיר/זום */
export function availableTrainingShareLine(lead: Lead): string {
  const sessions = leadCalendarSessions(lead)
  const primary = sessions[0]
  const dateRaw = primary?.date || lead.date || ""
  const timeRaw = primary?.time || lead.time || ""
  const date = dateRaw ? formatDate(dateRaw) : "—"
  const day = dateRaw ? `יום ${weekdayNameHe(dateRaw)}` : "—"
  const time = timeRaw?.trim() || "—"
  let place = "—"
  if (primary?.isZoom) {
    place = "זום"
  } else if (primary?.city?.trim()) {
    place = primary.city.trim()
  } else if (lead.address?.city?.trim()) {
    place = lead.address.city.trim()
  } else if (primary) {
    place = sessionLocationLabel(primary) || "—"
  } else if (lead.location?.trim()) {
    place = lead.location.trim()
  }
  return `${date} | ${day} | ${time} | ${place}`
}

export function buildAvailableTrainingsWhatsAppText(leads: Lead[]): string {
  return leads.map(availableTrainingShareLine).join("\n")
}

export function ShareAvailableTrainingsDialog({
  open,
  onOpenChange,
  leads,
}: Props) {
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const closedTrainings = useMemo(() => {
    return leads
      .filter((l) => l.status === "closed")
      .sort((a, b) => {
        const ta = a.date || ""
        const tb = b.date || ""
        return ta.localeCompare(tb)
      })
  }, [leads])

  useEffect(() => {
    if (!open) {
      setQ("")
      setSelected(new Set())
      return
    }
    // ברירת מחדל: הכל מסומן
    setSelected(new Set(closedTrainings.map((l) => l.id)))
  }, [open, closedTrainings])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return closedTrainings
    return closedTrainings.filter((l) => {
      const hay = [
        l.name,
        l.contactName,
        l.instructor,
        l.address?.city,
        l.location,
        l.date,
        formatLeadCourseType(l),
        availableTrainingShareLine(l),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(term)
    })
  }, [closedTrainings, q])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllFiltered = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const l of filtered) {
        if (on) next.add(l.id)
        else next.delete(l.id)
      }
      return next
    })
  }

  const selectedLeads = useMemo(() => {
    return closedTrainings.filter((l) => selected.has(l.id))
  }, [closedTrainings, selected])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((l) => selected.has(l.id))

  const openWhatsApp = () => {
    if (!selectedLeads.length) {
      toast.error("יש לסמן לפחות הדרכה אחת")
      return
    }
    const text = buildAvailableTrainingsWhatsAppText(selectedLeads)
    window.open(whatsappLink("", text), "_blank", "noopener,noreferrer")
    onOpenChange(false)
  }

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
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            שיתוף הדרכות פנויות
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            הדרכות בסטטוס «סגרנו נרשם ביומן» — סמנו מה ייכלל בהודעה, ואז בחרו
            נמען בוואטסאפ
          </p>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם, עיר או תאריך"
            className="h-10 pr-10 text-sm"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={(v) => toggleAllFiltered(Boolean(v))}
            />
            בחר הכל ({filtered.length})
          </label>
          <span className="text-muted-foreground">
            נבחרו {selectedLeads.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              אין הדרכות שנסגרו ביומן
            </p>
          ) : (
            filtered.map((l) => {
              const checked = selected.has(l.id)
              const line = availableTrainingShareLine(l)
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggle(l.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-right transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(l.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatLeadCourseType(l)}
                    </p>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed" dir="rtl">
                      {line}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-stretch">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            className="flex-1 gap-1.5 rounded-xl"
            disabled={!selectedLeads.length}
            onClick={openWhatsApp}
          >
            <MessageCircle className="size-4" />
            פתיחה בוואטסאפ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
