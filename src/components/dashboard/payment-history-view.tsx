"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/helpers"
import {
  buildProfitTransactions,
  groupProfitByMonth,
  type ProfitTransaction,
} from "@/lib/profit-history"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/app-shell"

export function PaymentHistoryView() {
  const { leads, equipment, settings, instructors } = useApp()

  const months = useMemo(() => {
    const txs = buildProfitTransactions(
      leads,
      equipment,
      settings.courses,
      instructors,
    )
    return groupProfitByMonth(txs)
  }, [leads, equipment, settings.courses, instructors])

  const [expanded, setExpanded] = useState<string | null>(
    months[0]?.monthKey ?? null,
  )

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <PageHeader
        title="היסטוריית תשלומים"
        subtitle="הדרכות בהן בוצע תשלום בפועל"
      />

      {months.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          עדיין אין תשלומים להצגה
        </p>
      ) : (
        <div className="space-y-2">
          {months.map((month) => {
            const isOpen = expanded === month.monthKey
            return (
              <div
                key={month.monthKey}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 p-3 text-right"
                  onClick={() =>
                    setExpanded(isOpen ? "" : month.monthKey)
                  }
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold capitalize">
                      {month.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <Metric
                      label="נגבה"
                      value={formatCurrency(month.revenue)}
                      tone="success"
                    />
                    <Metric
                      label="הוצאות"
                      value={formatCurrency(month.expenses)}
                      tone="danger"
                    />
                    <Metric
                      label="רווח נקי"
                      value={formatCurrency(month.netProfit)}
                      tone="primary"
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t border-border bg-secondary/30 p-2">
                    {month.transactions.map((tx) => (
                      <TxCard key={`${tx.kind}-${tx.id}`} tx={tx} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TxCard({ tx }: { tx: ProfitTransaction }) {
  return (
    <Link
      href={txHref(tx)}
      className="block rounded-xl border border-border bg-card p-3 transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{tx.itemLabel}</p>
          <p className="truncate text-xs text-muted-foreground">
            {tx.clientName} · {formatDate(tx.date)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tx.kind === "course"
            ? "קורס"
            : tx.kind === "training_sale"
              ? "מכירת שטח"
              : "ציוד"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
        <div>
          <p className="text-muted-foreground">נגבה</p>
          <p className="font-semibold">{formatCurrency(tx.revenue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">הוצאה</p>
          <p className="font-semibold">{formatCurrency(tx.expenses)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">רווח</p>
          <p
            className={cn(
              "font-bold",
              tx.netProfit >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {formatCurrency(tx.netProfit)}
          </p>
        </div>
      </div>
      {tx.remaining > 0 && (
        <p className="mt-1 text-[10px] text-amber-800">
          יתרה לגבייה: {formatCurrency(tx.remaining)}
        </p>
      )}
    </Link>
  )
}

function txHref(tx: ProfitTransaction): string {
  if (tx.kind === "course") return `/leads/${tx.id}`
  if (tx.kind === "equipment") return `/equipment/${tx.id}`
  return `/clients/${tx.clientId}`
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "success" | "danger" | "primary"
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : "text-primary"
  return (
    <div className="rounded-lg bg-secondary/60 px-1.5 py-1">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("font-bold tabular-nums", toneClass)}>{value}</p>
    </div>
  )
}
