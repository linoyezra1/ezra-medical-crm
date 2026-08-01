"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronLeft, MapPin, Users } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApp } from "@/lib/store"
import { formatCurrency, formatDate } from "@/lib/helpers"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

type Filter = "upcoming" | "done" | "certificates" | "all"

export function TrainingsView() {
  const { leads } = useApp()
  const [filter, setFilter] = useState<Filter>("upcoming")

  // הדרכות = לידים שאינם חדשים/אבודים ושיש להם תאריך
  const trainings = useMemo(
    () => leads.filter((l) => l.status !== "new" && l.status !== "lost"),
    [leads],
  )

  const filtered = useMemo(() => {
    let list = trainings
    if (filter === "upcoming") list = trainings.filter((l) => l.status === "closed")
    else if (filter === "done") list = trainings.filter((l) => l.status === "done" || l.status === "completed")
    else if (filter === "certificates") list = trainings.filter((l) => l.status === "pending_certificates")
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

  return (
    <div>
      <PageHeader title="הדרכות" subtitle={`${trainings.length} הדרכות במערכת`} />

      <div className="px-4 pt-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upcoming" className="text-xs">קרובות</TabsTrigger>
            <TabsTrigger value="done" className="text-xs">בוצעו</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">תעודות</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">הכל</TabsTrigger>
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
              {items.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
                >
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <span className="text-sm font-bold leading-none">{l.time || "--:--"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{l.name}</p>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{l.courseType}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {l.address.city || "-"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3" />
                        {l.participantsCount}
                      </span>
                      <span className="font-medium text-foreground">{formatCurrency(l.totalPrice)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={l.status} />
                    <ChevronLeft className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
