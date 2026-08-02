"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, MapPin, UserPlus, Users } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { CollectParticipantsDialog } from "@/components/leads/collect-participants-dialog"
import { StatusBadge } from "@/components/status-badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatLeadCourseType } from "@/lib/course-type"
import { useApp } from "@/lib/store"
import { formatDate } from "@/lib/helpers"
import type { Lead } from "@/lib/types"

type Filter = "upcoming" | "done" | "certificates" | "all"

export function TrainingsView() {
  const { leads } = useApp()
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [collectLead, setCollectLead] = useState<Lead | null>(null)

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
      const ta = a.date ? new Date(`${a.date}T${a.time || "00:00"}`).getTime() : 0
      const tb = b.date ? new Date(`${b.date}T${b.time || "00:00"}`).getTime() : 0
      return filter === "done" ? tb - ta : ta - tb
    })
  }, [trainings, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>()
    for (const l of filtered) {
      const key = l.date ? formatDate(l.date) : "ללא תאריך"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    return Array.from(map.entries())
  }, [filtered])

  const todayLabel = formatDate(new Date().toISOString().slice(0, 10))

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

      <div className="px-4 pt-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="grid w-full grid-cols-4">
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

      <div className="space-y-5 p-4">
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
              {items.map((l) => {
                const canCollect = l.status === "closed" || l.status === "done"
                return (
                  <div
                    key={l.id}
                    className="rounded-2xl border border-border bg-card p-3"
                  >
                    <Link
                      href={`/leads/${l.id}`}
                      className="flex items-start gap-3 active:opacity-90"
                    >
                      <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <span className="text-sm font-bold leading-none">
                          {l.time || "--:--"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {l.name}
                          </p>
                          <StatusBadge status={l.status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatLeadCourseType(l)}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {l.address.city || "-"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="size-3" />
                            {l.participants.length || l.participantsCount}
                          </span>
                        </div>
                      </div>
                    </Link>

                    {canCollect && (
                      <button
                        type="button"
                        onClick={() => setCollectLead(l)}
                        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground active:scale-[0.99] transition-transform"
                      >
                        <UserPlus className="size-4" />
                        הוסף משתתפים
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {collectLead && (
        <CollectParticipantsDialog
          lead={collectLead}
          open={Boolean(collectLead)}
          onOpenChange={(o) => {
            if (!o) setCollectLead(null)
          }}
        />
      )}
    </div>
  )
}
