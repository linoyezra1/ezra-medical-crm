"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CalendarClock,
  MapPin,
  MessageCircle,
  Send,
  User,
  Users,
  Video,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import {
  LeadItemActionsUi,
  useLeadItemActions,
} from "@/components/leads/lead-item-actions"
import { buildAvailableTrainingsWhatsAppText } from "@/components/quick-actions/share-available-trainings-dialog"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatLeadCourseType } from "@/lib/course-type"
import {
  formatDateWithWeekday,
  leadStatusCardClass,
  whatsappLink,
} from "@/lib/helpers"
import { shouldShowUnassignedInstructorWarning } from "@/lib/instructor"
import { useApp } from "@/lib/store"
import { jerusalemLocalToUtcDate } from "@/lib/timezone"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

type Filter = "upcoming" | "pending_certificates" | "completed" | "all"

export function TrainingsView() {
  const { leads } = useApp()
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [shareMode, setShareMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const trainings = useMemo(
    () => leads.filter((l) => l.status !== "new" && l.status !== "lost"),
    [leads],
  )

  // במצב שיתוף מציגים רק הדרכות שנסגרו ביומן
  const filtered = useMemo(() => {
    let list = trainings
    if (shareMode || filter === "upcoming") {
      list = trainings.filter((l) => l.status === "closed")
    } else if (filter === "pending_certificates") {
      list = trainings.filter((l) => l.status === "pending_certificates")
    } else if (filter === "completed") {
      list = trainings.filter((l) => l.status === "completed")
    }
    return [...list].sort((a, b) => {
      const ta = a.date
        ? jerusalemLocalToUtcDate(a.date, a.time || "00:00").getTime()
        : 0
      const tb = b.date
        ? jerusalemLocalToUtcDate(b.date, b.time || "00:00").getTime()
        : 0
      return shareMode || filter === "upcoming" ? ta - tb : tb - ta
    })
  }, [trainings, filter, shareMode])

  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>()
    for (const l of filtered) {
      const key = l.date ? formatDateWithWeekday(l.date) : "ללא תאריך"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    return Array.from(map.entries())
  }, [filtered])

  const todayLabel = formatDateWithWeekday(new Date().toISOString().slice(0, 10))

  const selectedLeads = useMemo(() => {
    return filtered.filter((l) => selected.has(l.id))
  }, [filtered, selected])

  useEffect(() => {
    if (!shareMode) return
    // מסירים בחירות של הדרכות שלא מוצגות יותר
    setSelected((prev) => {
      const ids = new Set(filtered.map((l) => l.id))
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [filtered, shareMode])

  const enterShareMode = () => {
    setSelected(new Set())
    setFilter("upcoming")
    setShareMode(true)
  }

  const exitShareMode = () => {
    setShareMode(false)
    setSelected(new Set())
  }

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openWhatsApp = () => {
    if (!selectedLeads.length) {
      toast.error("יש לסמן לפחות הדרכה אחת")
      return
    }
    const text = buildAvailableTrainingsWhatsAppText(selectedLeads)
    window.open(whatsappLink("", text), "_blank", "noopener,noreferrer")
    exitShareMode()
  }

  return (
    <div className={cn(shareMode && "pb-24")}>
      <PageHeader
        title="הדרכות"
        subtitle={
          shareMode
            ? `בחרו הדרכות לשיתוף · נבחרו ${selected.size}`
            : `${trainings.length} הדרכות במערכת`
        }
        action={
          <div className="flex items-center gap-2">
            {shareMode ? (
              <button
                type="button"
                onClick={exitShareMode}
                aria-label="ביטול שיתוף"
                title="ביטול"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                <X className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={enterShareMode}
                aria-label="שליחת פרטי הדרכות בוואטסאפ"
                title="שליחת פרטי הדרכות בוואטסאפ"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15"
              >
                <Send className="size-4" />
              </button>
            )}
            <div className="shrink-0 rounded-xl bg-primary/10 px-2.5 py-1.5 text-left">
              <p className="text-[10px] font-medium text-muted-foreground">
                היום
              </p>
              <p className="text-xs font-bold tabular-nums text-primary">
                {todayLabel}
              </p>
            </div>
          </div>
        }
      />

      {!shareMode ? (
        <div className="px-4 pt-3 md:mx-auto md:max-w-6xl md:px-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="grid w-full grid-cols-4 md:max-w-lg">
              <TabsTrigger value="upcoming" className="text-xs">
                קרובות
              </TabsTrigger>
              <TabsTrigger
                value="pending_certificates"
                className="text-[10px] leading-tight sm:text-xs"
              >
                בוצעו וממתינות לתעודות
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs">
                הסתיים
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs">
                הכל
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : (
        <div className="px-4 pt-3 md:mx-auto md:max-w-6xl md:px-6">
          <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            סמנו הדרכות שנסגרו ביומן, ואז פתחו בוואטסאפ
          </p>
        </div>
      )}

      {/* מובייל: כרטיסים מקובצים */}
      <div className="space-y-5 p-4 md:hidden">
        {grouped.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            אין הדרכות בקטגוריה זו
          </div>
        )}
        {grouped.map(([day, items]) => (
          <section key={day}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <CalendarClock className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">{day}</h2>
            </div>
            <div className="space-y-2">
              {items.map((l) => (
                <TrainingCard
                  key={l.id}
                  lead={l}
                  shareMode={shareMode}
                  selected={selected.has(l.id)}
                  onToggleSelect={() => toggleSelected(l.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* דסקטופ: טבלה מורחבת */}
      <div className="hidden p-4 md:mx-auto md:block md:max-w-6xl md:p-6">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            אין הדרכות בקטגוריה זו
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full min-w-[800px] text-right text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-2.5" />
                  <th className="px-3 py-2.5 font-semibold">תאריך / שעה</th>
                  <th className="px-3 py-2.5 font-semibold">שם</th>
                  <th className="px-3 py-2.5 font-semibold">סטטוס</th>
                  <th className="px-3 py-2.5 font-semibold">קורס</th>
                  <th className="px-3 py-2.5 font-semibold">עיר</th>
                  <th className="px-3 py-2.5 font-semibold">כתובת</th>
                  <th className="px-3 py-2.5 font-semibold">מדריך</th>
                  <th className="px-3 py-2.5 font-semibold">משתתפים</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <TrainingTableRow
                    key={l.id}
                    lead={l}
                    shareMode={shareMode}
                    selected={selected.has(l.id)}
                    onToggleSelect={() => toggleSelected(l.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {shareMode ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl md:flex-none md:px-6"
              onClick={exitShareMode}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="flex-[1.4] gap-1.5 rounded-xl md:flex-none md:px-6"
              disabled={!selected.size}
              onClick={openWhatsApp}
            >
              <MessageCircle className="size-4" />
              פתיחה בוואטסאפ
              {selected.size ? ` (${selected.size})` : ""}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TrainingTableRow({
  lead: l,
  shareMode,
  selected,
  onToggleSelect,
}: {
  lead: Lead
  shareMode: boolean
  selected: boolean
  onToggleSelect: () => void
}) {
  const { settings } = useApp()
  const actions = useLeadItemActions(l)

  return (
    <tr
      className={cn(
        "border-t border-border transition-colors",
        shareMode
          ? cn(
              "cursor-pointer",
              selected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/30",
            )
          : "hover:bg-secondary/30",
      )}
      onClick={shareMode ? onToggleSelect : undefined}
    >
      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
        {shareMode ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect()}
            aria-label={`בחירה ${l.name}`}
          />
        ) : (
          <LeadItemActionsUi lead={l} state={actions} kebabDesktopOnly={false} />
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <div className="font-medium">
          {l.date ? formatDateWithWeekday(l.date) : "—"}
        </div>
        <div className="text-xs text-muted-foreground">
          {l.time || "—"}
          {l.endTime ? `–${l.endTime}` : ""}
        </div>
      </td>
      <td className="px-3 py-2.5">
        {shareMode ? (
          <span className="font-semibold">{l.name}</span>
        ) : (
          <Link
            href={`/leads/${l.id}`}
            className="font-semibold text-primary hover:underline"
          >
            {l.name}
          </Link>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={l.status} />
      </td>
      <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">
        {formatLeadCourseType(l, settings.courses)}
      </td>
      <td className="px-3 py-2.5">{l.address.city || "—"}</td>
      <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">
        {[l.address.street, l.address.houseNumber].filter(Boolean).join(" ") ||
          "—"}
      </td>
      <td className="px-3 py-2.5">
        {shouldShowUnassignedInstructorWarning(l) ? (
          <span className="font-bold text-red-600">לא שובץ מדריך</span>
        ) : (
          l.instructor || "—"
        )}
      </td>
      <td className="px-3 py-2.5">
        {l.participants.length || l.participantsCount}
      </td>
    </tr>
  )
}

function TrainingCard({
  lead: l,
  shareMode,
  selected,
  onToggleSelect,
}: {
  lead: Lead
  shareMode: boolean
  selected: boolean
  onToggleSelect: () => void
}) {
  const router = useRouter()
  const actions = useLeadItemActions(l)

  return (
    <div
      role={shareMode ? "checkbox" : "link"}
      aria-checked={shareMode ? selected : undefined}
      tabIndex={0}
      {...(shareMode ? {} : actions.bind)}
      onClick={() => {
        if (shareMode) {
          onToggleSelect()
          return
        }
        if (actions.consumeLongPress()) return
        router.push(`/leads/${l.id}`)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          if (shareMode) onToggleSelect()
          else router.push(`/leads/${l.id}`)
        }
      }}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 select-none active:scale-[0.99] transition-transform",
        shareMode
          ? selected
            ? "border-primary bg-primary/5"
            : "border-border bg-card"
          : leadStatusCardClass(l.status),
      )}
    >
      {shareMode ? (
        <div className="flex size-12 shrink-0 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`בחירה ${l.name}`}
          />
        </div>
      ) : (
        <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/80 text-primary">
          <span className="text-sm font-bold leading-none">
            {l.time || "--:--"}
          </span>
          {l.endTime && (
            <span className="mt-0.5 text-[9px] text-muted-foreground">
              עד {l.endTime}
            </span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {l.name}
          </p>
          {!shareMode ? (
            <div className="flex shrink-0 items-center gap-1">
              <LeadItemActionsUi lead={l} state={actions} showKebab={false} />
              <StatusBadge status={l.status} />
            </div>
          ) : (
            <StatusBadge status={l.status} />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatLeadCourseType(l)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {shareMode ? (
            <span className="font-medium text-foreground">
              {l.time || "—"}
              {l.endTime ? `–${l.endTime}` : ""}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            {l.sessions?.[0]?.isZoom ? (
              <Video className="size-3 text-sky-700" />
            ) : (
              <MapPin className="size-3" />
            )}
            {l.sessions?.[0]?.isZoom
              ? l.sessions[0].zoomLink
                ? "זום"
                : "זום · חסר קישור"
              : l.address.city || "-"}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            {l.participants.length || l.participantsCount}
          </span>
          {shouldShowUnassignedInstructorWarning(l) ? (
            <span className="font-bold text-red-600">לא שובץ מדריך</span>
          ) : l.instructor ? (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <User className="size-3" />
              {l.instructor}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
