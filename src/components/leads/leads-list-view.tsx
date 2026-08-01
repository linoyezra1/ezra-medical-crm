"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Plus, Search } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { LeadCard } from "@/components/leads/lead-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApp } from "@/lib/store"
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types"
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

export function LeadsListView() {
  const { leads } = useApp()
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

  return (
    <div>
      <PageHeader
        title="לידים"
        subtitle={`${filtered.length} רשומות`}
        action={
          <Button
            size="icon"
            nativeButton={false}
            className="size-10 rounded-full shrink-0"
            render={
              <Link href="/leads/new" aria-label="ליד חדש">
                <Plus className="size-5" />
              </Link>
            }
          />
        }
      />

      <div className="space-y-3 p-4">
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

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
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

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              לא נמצאו לידים
            </div>
          ) : (
            filtered.map((lead) => <LeadCard key={lead.id} lead={lead} />)
          )}
        </div>
      </div>
    </div>
  )
}
