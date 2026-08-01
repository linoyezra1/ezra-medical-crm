"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, MapPin, Phone, Search, Users } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Input } from "@/components/ui/input"
import { useApp } from "@/lib/store"
import { formatPhone } from "@/lib/helpers"

export function ClientsView() {
  const { clients, leads, equipment } = useApp()
  const [q, setQ] = useState("")

  const enriched = useMemo(() => {
    return clients
      .map((c) => {
        const cLeads = leads.filter((l) => l.clientId === c.id)
        const cEquip = equipment.filter((e) => e.clientId === c.id)
        const revenue =
          cLeads.filter((l) => l.status === "completed").reduce((s, l) => s + l.totalPrice, 0) +
          cEquip.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0)
        return { ...c, leadCount: cLeads.length, equipCount: cEquip.length, revenue }
      })
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q.toLowerCase()) ||
          c.phone.includes(q) ||
          (c.city || "").includes(q),
      )
      .sort((a, b) => b.revenue - a.revenue)
  }, [clients, leads, equipment, q])

  return (
    <div>
      <PageHeader title="לקוחות" subtitle={`${clients.length} לקוחות`} />

      <div className="sticky top-[57px] z-20 bg-background/95 px-4 py-3 backdrop-blur-md">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון או עיר"
            className="pr-10"
            inputMode="search"
          />
        </div>
      </div>

      <div className="space-y-2 p-4">
        {enriched.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {c.name.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />
                  {formatPhone(c.phone)}
                </span>
                {c.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {c.city}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="size-3" />
                {c.leadCount} הדרכות · {c.equipCount} עסקאות ציוד
              </div>
            </div>
            <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
        {enriched.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            לא נמצאו לקוחות
          </div>
        )}
      </div>
    </div>
  )
}
