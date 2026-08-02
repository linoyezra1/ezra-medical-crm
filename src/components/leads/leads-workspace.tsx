"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Plus, Search } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { LeadCard } from "@/components/leads/lead-card"
import { LeadDetailView } from "@/components/leads/lead-detail-view"
import { LeadStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatLeadCourseType } from "@/lib/course-type"
import {
  formatCurrency,
  formatDateWithWeekday,
  leadStatusCardClass,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import { LEAD_STATUS_LABELS, type Lead, type LeadStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const FILTERS: { value: LeadStatus | "all" | "urgent"; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "urgent", label: "דחוף" },
  { value: "new", label: LEAD_STATUS_LABELS.new },
  { value: "closed", label: LEAD_STATUS_LABELS.closed },
  { value: "done", label: LEAD_STATUS_LABELS.done },
  { value: "pending_certificates", label: LEAD_STATUS_LABELS.pending_certificates },
  { value: "completed", label: LEAD_STATUS_LABELS.completed },
  { value: "lost", label: LEAD_STATUS_LABELS.lost },
]

export function LeadsWorkspace({ selectedId }: { selectedId?: string }) {
  const { leads, settings } = useApp()
  const [filter, setFilter] = useState<LeadStatus | "all" | "urgent">("all")
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    return leads
      .filter((l) => {
        if (filter === "all") return l.status !== "lost"
        if (filter === "urgent") return l.urgent && l.status !== "lost"
        return l.status === filter
      })
      .filter((l) => {
        if (!query.trim()) return true
        const q = query.trim()
        return (
          l.name.includes(q) ||
          l.phone.includes(q) ||
          l.courseType.includes(q) ||
          (l.courseTypeOther?.includes(q) ?? false) ||
          l.address.city.includes(q)
        )
      })
      .sort((a, b) => Number(b.urgent) - Number(a.urgent))
  }, [leads, filter, query])

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="לידים"
        subtitle={`${filtered.length} רשומות`}
        action={
          <Button
            size="icon"
            nativeButton={false}
            className="size-10 shrink-0 rounded-full md:size-9"
            render={
              <Link href="/leads/new" aria-label="ליד חדש">
                <Plus className="size-5" />
              </Link>
            }
          />
        }
      />

      <div className="space-y-3 overflow-y-auto p-4 md:px-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון, קורס או עיר"
            className="pr-9"
            inputMode="search"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* מובייל: כרטיסים */}
        <div className="space-y-3 md:hidden">
          {filtered.length === 0 ? (
            <EmptyList />
          ) : (
            filtered.map((lead) => <LeadCard key={lead.id} lead={lead} />)
          )}
        </div>

        {/* דסקטופ בפיצול: שורות קומפקטיות */}
        <div className="hidden space-y-1 md:block">
          {filtered.length === 0 ? (
            <EmptyList />
          ) : (
            filtered.map((lead) => {
              const selected = lead.id === selectedId
              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className={cn(
                    "block rounded-xl border-2 px-3 py-2.5 transition-colors",
                    leadStatusCardClass(lead.status),
                    selected
                      ? "ring-2 ring-primary/50"
                      : "hover:brightness-[0.98]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{lead.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatLeadCourseType(lead, settings.courses)}
                        {lead.address.city ? ` · ${lead.address.city}` : ""}
                      </p>
                    </div>
                    <LeadStatusBadge status={lead.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {lead.date && (
                      <span>
                        {formatDateWithWeekday(lead.date)}
                        {lead.time ? ` · ${lead.time}` : ""}
                      </span>
                    )}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(lead.totalPrice)}
                    </span>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="md:flex md:h-[calc(100dvh)] md:overflow-hidden">
      {/* רשימה: תמיד במובייל כשאין בחירה; בדסקטופ תמיד בצד */}
      <aside
        className={cn(
          "min-h-0 md:flex md:w-[360px] md:shrink-0 md:flex-col md:border-e md:border-border lg:w-[400px]",
          selectedId ? "hidden md:flex" : "flex flex-col",
        )}
      >
        {listPane}
      </aside>

      {/* פרטים / טבלה רחבה */}
      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-y-auto",
          selectedId ? "block" : "hidden md:block",
        )}
      >
        {selectedId ? (
          <LeadDetailView leadId={selectedId} embedded />
        ) : (
          <DesktopLeadsTable leads={filtered} />
        )}
      </section>
    </div>
  )
}

function EmptyList() {
  return (
    <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
      לא נמצאו לידים
    </div>
  )
}

function DesktopLeadsTable({ leads }: { leads: Lead[] }) {
  const { settings } = useApp()

  if (leads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        בחרו ליד מהרשימה או צרו ליד חדש
      </div>
    )
  }

  return (
    <div className="hidden h-full flex-col md:flex">
      <PageHeader title="טבלת לידים" subtitle="תצוגת דסקטופ מורחבת" />
      <div className="overflow-auto p-4 lg:p-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">שם</th>
                <th className="px-3 py-2.5 font-semibold">סטטוס</th>
                <th className="px-3 py-2.5 font-semibold">קורס</th>
                <th className="px-3 py-2.5 font-semibold">עיר</th>
                <th className="px-3 py-2.5 font-semibold">תאריך</th>
                <th className="px-3 py-2.5 font-semibold">מדריך</th>
                <th className="px-3 py-2.5 font-semibold">טלפון</th>
                <th className="px-3 py-2.5 font-semibold">מחיר</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-t border-border transition-colors hover:bg-secondary/30"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {lead.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2.5 text-muted-foreground">
                    {formatLeadCourseType(lead, settings.courses)}
                  </td>
                  <td className="px-3 py-2.5">{lead.address.city || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {lead.date ? formatDateWithWeekday(lead.date) : "—"}
                    {lead.time ? ` ${lead.time}` : ""}
                  </td>
                  <td className="px-3 py-2.5">{lead.instructor || "—"}</td>
                  <td className="px-3 py-2.5 dir-ltr text-left" dir="ltr">
                    {lead.phone}
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    {formatCurrency(lead.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
