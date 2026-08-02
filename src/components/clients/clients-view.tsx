"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, MapPin, Phone, Search, Users } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { TraineesPanel } from "@/components/clients/trainees-panel"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApp } from "@/lib/store"
import { formatCurrency, formatPhone } from "@/lib/helpers"

export function ClientsView() {
  const { clients, leads, equipment, trainees } = useApp()
  const [tab, setTab] = useState<"clients" | "trainees">("trainees")
  const [q, setQ] = useState("")

  const enriched = useMemo(() => {
    return clients
      .map((c) => {
        const cLeads = leads.filter((l) => l.clientId === c.id)
        const cEquip = equipment.filter((e) => e.clientId === c.id)
        const revenue =
          cLeads
            .filter((l) => l.status === "completed")
            .reduce((s, l) => s + l.totalPrice, 0) +
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
      <PageHeader
        title="לקוחות ומודרכים"
        subtitle={`${clients.length} לקוחות · ${trainees.length} מודרכים`}
      />

      <div className="px-4 pt-3 md:mx-auto md:max-w-6xl md:px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2 md:max-w-sm">
            <TabsTrigger value="trainees" className="text-xs">
              מודרכים
            </TabsTrigger>
            <TabsTrigger value="clients" className="text-xs">
              לקוחות
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "trainees" ? (
        <div className="p-4 md:mx-auto md:max-w-6xl md:p-6">
          <TraineesPanel />
        </div>
      ) : (
        <>
          <div className="sticky top-[57px] z-20 bg-background/95 px-4 py-3 backdrop-blur-md md:static md:mx-auto md:max-w-6xl md:px-6 md:pt-4">
            <div className="relative md:max-w-md">
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

          {/* מובייל: כרטיסים */}
          <div className="space-y-2 p-4 md:hidden">
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
                  <p className="truncate text-sm font-semibold text-foreground">
                    {c.name}
                  </p>
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

          {/* דסקטופ: טבלה */}
          <div className="hidden p-4 md:mx-auto md:block md:max-w-6xl md:p-6 md:pt-2">
            {enriched.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
                לא נמצאו לקוחות
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full min-w-[700px] text-right text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">שם</th>
                      <th className="px-3 py-2.5 font-semibold">טלפון</th>
                      <th className="px-3 py-2.5 font-semibold">עיר</th>
                      <th className="px-3 py-2.5 font-semibold">הדרכות</th>
                      <th className="px-3 py-2.5 font-semibold">ציוד</th>
                      <th className="px-3 py-2.5 font-semibold">הכנסות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((c) => (
                      <tr
                        key={c.id}
                        className="border-t border-border transition-colors hover:bg-secondary/30"
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/clients/${c.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5" dir="ltr">
                          {formatPhone(c.phone)}
                        </td>
                        <td className="px-3 py-2.5">{c.city || "—"}</td>
                        <td className="px-3 py-2.5">{c.leadCount}</td>
                        <td className="px-3 py-2.5">{c.equipCount}</td>
                        <td className="px-3 py-2.5 font-medium">
                          {formatCurrency(c.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
