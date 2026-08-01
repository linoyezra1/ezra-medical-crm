"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, Plus } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApp } from "@/lib/store"
import { formatCurrency } from "@/lib/helpers"
import { EQUIPMENT_STATUS_LABELS, type EquipmentStatus } from "@/lib/types"

type Filter = "open" | "paid" | "all"

export function EquipmentView() {
  const { equipment, getClient } = useApp()
  const [filter, setFilter] = useState<Filter>("open")

  const filtered = useMemo(() => {
    let list = equipment
    if (filter === "open") list = equipment.filter((e) => e.status !== "paid")
    else if (filter === "paid") list = equipment.filter((e) => e.status === "paid")
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [equipment, filter])

  const openValue = equipment
    .filter((e) => e.status !== "paid")
    .reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="עסקאות ציוד"
        subtitle={`${formatCurrency(openValue)} בצנרת`}
        action={
          <Button
            size="sm"
            nativeButton={false}
            className="gap-1"
            render={
              <Link href="/equipment/new">
                <Plus className="size-4" /> חדש
              </Link>
            }
          />
        }
      />

      <div className="px-4 pt-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="open" className="text-xs">פתוחות</TabsTrigger>
            <TabsTrigger value="paid" className="text-xs">שולמו</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">הכל</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-2 p-4">
        {filtered.map((e) => {
          const client = getClient(e.clientId)
          return (
            <Link
              key={e.id}
              href={`/equipment/${e.id}`}
              className="block rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{client?.name || e.contactName}</p>
                </div>
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <StatusBadge status={e.status} kind="equipment" />
                <span className="text-sm font-bold text-foreground">{formatCurrency(e.amount)}</span>
              </div>
            </Link>
          )
        })}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            אין עסקאות בקטגוריה זו
          </div>
        )}
      </div>

      {/* מקרא סטטוסים */}
      <div className="mx-4 mb-4 rounded-2xl bg-secondary/40 p-3">
        <p className="mb-2 text-xs font-semibold text-foreground">שלבי עסקה</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((s) => (
            <StatusBadge key={s} status={s} kind="equipment" />
          ))}
        </div>
      </div>
    </div>
  )
}
