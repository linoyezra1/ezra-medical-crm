"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, MapPin, User, Users } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatLeadCourseType } from "@/lib/course-type"
import { formatDateWithWeekday, leadStatusCardClass } from "@/lib/helpers"
import { isInstructorUnassigned } from "@/lib/instructor"
import { useApp } from "@/lib/store"
import { jerusalemLocalToUtcDate } from "@/lib/timezone"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

type Filter = "upcoming" | "done" | "certificates" | "all"

export function TrainingsView() {
  const { leads, settings } = useApp()
  const [filter, setFilter] = useState<Filter>("upcoming")

  const trainings = useMemo(
    () => leads.filter((l) => l.status !== "new" && l.status !== "lost"),
    [leads],
  )

  const filtered = useMemo(() => {
    let list = trainings
    if (filter === "upcoming") list = trainings.filter((l) => l.status === "closed")
    else if (filter === "done")
      list = trainings.filter((l) => l.status === "done" || l.status === "completed")
    else if (filter === "certificates")
      list = trainings.filter((l) => l.status === "pending_certificates")
    return [...list].sort((a, b) => {
      const ta = a.date
        ? jerusalemLocalToUtcDate(a.date, a.time || "00:00").getTime()
        : 0
      const tb = b.date
        ? jerusalemLocalToUtcDate(b.date, b.time || "00:00").getTime()
        : 0
      return filter === "done" ? tb - ta : ta - tb
    })
  }, [trainings, filter])

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

  return (
    <div>
      <PageHeader
        title="הדרכות"
        subtitle={`${trainings.length} הדרכות במערכת`}
        action={
          <div className="shrink-0 rounded-xl bg-primary/10 px-2.5 py-1.5 text-left">
            <p className="text-[10px] font-medium text-muted-foreground">היום</p>
            <p className="text-xs font-bold tabular-nums text-primary">{todayLabel}</p>
          </div>
        }
      />

      <div className="px-4 pt-3 md:mx-auto md:max-w-6xl md:px-6">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="grid w-full grid-cols-4 md:max-w-md">
            <TabsTrigger value="upcoming" className="text-xs">
              קרובות
            </TabsTrigger>
            <TabsTrigger value="done" className="text-xs">
              בוצעו
            </TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              תעודות
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              הכל
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </div>
            <div className="space-y-2">
              {items.map((l) => (
                <TrainingCard key={l.id} lead={l} />
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
                  <tr
                    key={l.id}
                    className="border-t border-border transition-colors hover:bg-secondary/30"
                  >
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
                      <Link
                        href={`/leads/${l.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {l.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">
                      {formatLeadCourseType(l, settings.courses)}
                    </td>
                    <td className="px-3 py-2.5">{l.address.city || "—"}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">
                      {[l.address.street, l.address.houseNumber]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {isInstructorUnassigned(l.instructor) ? (
                        <span className="font-bold text-red-600">
                          לא שובץ מדריך
                        </span>
                      ) : (
                        l.instructor || "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.participants.length || l.participantsCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function TrainingCard({ lead: l }: { lead: Lead }) {
  return (
    <Link
      href={`/leads/${l.id}`}
      className={cn(
        "flex items-start gap-3 rounded-2xl border-2 p-3 active:scale-[0.99] transition-transform",
        leadStatusCardClass(l.status),
      )}
    >
      <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/80 text-primary">
        <span className="text-sm font-bold leading-none">{l.time || "--:--"}</span>
        {l.endTime && (
          <span className="mt-0.5 text-[9px] text-muted-foreground">
            עד {l.endTime}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{l.name}</p>
          <StatusBadge status={l.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatLeadCourseType(l)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {l.address.city || "-"}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            {l.participants.length || l.participantsCount}
          </span>
          {isInstructorUnassigned(l.instructor) ? (
            <span className="font-bold text-red-600">לא שובץ מדריך</span>
          ) : l.instructor ? (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <User className="size-3" />
              {l.instructor}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
