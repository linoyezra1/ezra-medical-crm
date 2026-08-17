"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { LayoutGrid, LayoutList, Plus, Search } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { ExternalParticipantDialog } from "@/components/leads/external-participant-dialog"
import { LeadCard } from "@/components/leads/lead-card"
import { LeadDetailView } from "@/components/leads/lead-detail-view"
import {
  LeadItemActionsUi,
  useLeadItemActions,
} from "@/components/leads/lead-item-actions"
import { LeadStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatLeadCourseType } from "@/lib/course-type"
import { formatCurrency, formatDateWithWeekday } from "@/lib/helpers"
import { leadDisplayPrice } from "@/lib/training-profit"
import { shouldShowUnassignedInstructorWarning } from "@/lib/instructor"
import { useApp } from "@/lib/store"
import { LEAD_STATUS_LABELS, type Lead, type LeadStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const FILTERS: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "new", label: LEAD_STATUS_LABELS.new },
  { value: "closed", label: LEAD_STATUS_LABELS.closed },
  { value: "pending_certificates", label: LEAD_STATUS_LABELS.pending_certificates },
  { value: "completed", label: LEAD_STATUS_LABELS.completed },
  { value: "lost", label: LEAD_STATUS_LABELS.lost },
]

type DesktopBrowseMode = "cards" | "table"

export function LeadsWorkspace({ selectedId }: { selectedId?: string }) {
  const { leads } = useApp()
  const [filter, setFilter] = useState<LeadStatus | "all">("new")
  const [query, setQuery] = useState("")
  const [browseMode, setBrowseMode] = useState<DesktopBrowseMode>("cards")
  const [externalOpen, setExternalOpen] = useState(false)

  // Deep-link: /leads?status=new
  useEffect(() => {
    if (typeof window === "undefined") return
    const status = new URLSearchParams(window.location.search).get("status")
    if (
      status === "new" ||
      status === "closed" ||
      status === "pending_certificates" ||
      status === "completed" ||
      status === "lost"
    ) {
      setFilter(status)
    }
  }, [])

  const filtered = useMemo(() => {
    return leads
      .filter((l) => {
        if (filter === "all") return l.status !== "lost"
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
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
  }, [leads, filter, query])

  const filtersBar = (
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
  )

  const searchBox = (
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
  )

  /** מובייל בלבד — רשימת כרטיסים (בדסקטופ אין פיצול כשיש ליד נבחר) */
  const mobileListPane = (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      <PageHeader
        title="לידים"
        subtitle={`${filtered.length} רשומות`}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              type="button"
              className="size-10 shrink-0 rounded-full bg-pink-500 text-white hover:bg-pink-600"
              aria-label="מצטרף נוסף"
              onClick={() => setExternalOpen(true)}
            >
              <Plus className="size-5" />
            </Button>
            <Button
              size="icon"
              nativeButton={false}
              className="size-10 shrink-0 rounded-full"
              render={
                <Link href="/leads/new" aria-label="ליד חדש">
                  <Plus className="size-5" />
                </Link>
              }
            />
          </div>
        }
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4">
        {searchBox}
        {filtersBar}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <EmptyList />
          ) : (
            filtered.map((lead) => <LeadCard key={lead.id} lead={lead} />)
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-full overflow-x-hidden md:h-[calc(100dvh)] md:overflow-hidden">
      {/* —— Desktop: אין ליד נבחר — תצוגה אחת (כרטיסים או טבלה) —— */}
      {!selectedId && (
        <div className="hidden h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden md:flex">
          <PageHeader
            title="לידים"
            subtitle={`${filtered.length} רשומות`}
            action={
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-border bg-card p-0.5">
                  <button
                    type="button"
                    onClick={() => setBrowseMode("cards")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      browseMode === "cards"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary",
                    )}
                    aria-pressed={browseMode === "cards"}
                  >
                    <LayoutGrid className="size-3.5" />
                    תצוגת כרטיסים
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrowseMode("table")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      browseMode === "table"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary",
                    )}
                    aria-pressed={browseMode === "table"}
                  >
                    <LayoutList className="size-3.5" />
                    תצוגת טבלה מורחבת
                  </button>
                </div>
                <Button
                  size="icon"
                  type="button"
                  className="size-9 shrink-0 rounded-full bg-pink-500 text-white hover:bg-pink-600"
                  aria-label="מצטרף נוסף"
                  onClick={() => setExternalOpen(true)}
                >
                  <Plus className="size-5" />
                </Button>
                <Button
                  size="icon"
                  nativeButton={false}
                  className="size-9 shrink-0 rounded-full"
                  render={
                    <Link href="/leads/new" aria-label="ליד חדש">
                      <Plus className="size-5" />
                    </Link>
                  }
                />
              </div>
            }
          />

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4 lg:p-5">
            {searchBox}
            {filtersBar}

            {browseMode === "cards" ? (
              filtered.length === 0 ? (
                <EmptyList />
              ) : (
                <div className="grid w-full max-w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filtered.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </div>
              )
            ) : (
              <DesktopLeadsTable leads={filtered} />
            )}
          </div>
        </div>
      )}

      {/* —— Desktop: ליד נבחר — תצוגת פרטים במלוא הרוחב (ללא פיצול) —— */}
      {selectedId && (
        <div className="hidden h-full min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden md:block">
          <LeadDetailView leadId={selectedId} embedded />
        </div>
      )}

      {/* —— Mobile —— */}
      <div
        className={cn(
          "min-h-0 w-full max-w-full flex-col overflow-x-hidden md:hidden",
          selectedId ? "hidden" : "flex",
        )}
      >
        {mobileListPane}
      </div>
      {selectedId && (
        <div className="min-h-0 w-full max-w-full overflow-x-hidden md:hidden">
          <LeadDetailView leadId={selectedId} embedded />
        </div>
      )}
      <ExternalParticipantDialog
        open={externalOpen}
        onOpenChange={setExternalOpen}
      />
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
  if (leads.length === 0) {
    return <EmptyList />
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden rounded-xl border border-border bg-card">
      <table className="w-full table-fixed text-right text-xs">
        <thead className="bg-secondary/50 text-[11px] text-muted-foreground">
          <tr>
            <th className="w-[5%] px-1 py-2" />
            <th className="w-[15%] px-2 py-2 font-semibold">שם</th>
            <th className="w-[13%] px-2 py-2 font-semibold">סטטוס</th>
            <th className="w-[16%] px-2 py-2 font-semibold">קורס</th>
            <th className="w-[9%] px-2 py-2 font-semibold">עיר</th>
            <th className="w-[13%] px-2 py-2 font-semibold">תאריך</th>
            <th className="w-[10%] px-2 py-2 font-semibold">מדריך</th>
            <th className="w-[10%] px-2 py-2 font-semibold">טלפון</th>
            <th className="w-[9%] px-2 py-2 font-semibold">מחיר</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <DesktopLeadRow key={lead.id} lead={lead} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DesktopLeadRow({ lead }: { lead: Lead }) {
  const { settings } = useApp()
  const actions = useLeadItemActions(lead)

  return (
    <tr className="border-t border-border transition-colors hover:bg-secondary/30">
      <td className="px-1 py-2">
        <LeadItemActionsUi lead={lead} state={actions} kebabDesktopOnly={false} />
      </td>
      <td className="max-w-0 truncate px-2 py-2">
        <Link
          href={`/leads/${lead.id}`}
          className="font-semibold text-primary hover:underline"
        >
          {lead.name}
        </Link>
      </td>
      <td className="px-2 py-2">
        <div className="max-w-full overflow-hidden">
          <LeadStatusBadge status={lead.status} />
        </div>
      </td>
      <td className="max-w-0 truncate px-2 py-2 text-muted-foreground">
        {formatLeadCourseType(lead, settings.courses)}
      </td>
      <td className="max-w-0 truncate px-2 py-2">
        {lead.address.city || "—"}
      </td>
      <td className="max-w-0 truncate px-2 py-2 whitespace-nowrap">
        {lead.date ? formatDateWithWeekday(lead.date) : "—"}
        {lead.time ? ` ${lead.time}` : ""}
      </td>
      <td className="max-w-0 truncate px-2 py-2">
        {shouldShowUnassignedInstructorWarning(lead) ? (
          <span className="font-bold text-red-600">לא שובץ מדריך</span>
        ) : (
          lead.instructor || "—"
        )}
      </td>
      <td
        className="max-w-0 truncate px-2 py-2 dir-ltr text-left"
        dir="ltr"
      >
        {lead.phone}
      </td>
      <td className="max-w-0 truncate px-2 py-2 font-medium">
        {formatCurrency(leadDisplayPrice(lead))}
      </td>
    </tr>
  )
}
