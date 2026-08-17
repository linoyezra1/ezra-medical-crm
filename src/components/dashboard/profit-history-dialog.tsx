"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { formatCurrency, formatDate } from "@/lib/helpers"
import {
  buildProfitTransactions,
  groupProfitByMonth,
  type ProfitTransaction,
} from "@/lib/profit-history"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

export function ProfitHistoryDialog({
  onPrimaryBackground = false,
}: {
  onPrimaryBackground?: boolean
}) {
  const { leads, equipment, settings, instructors } = useApp()
  const [open, setOpen] = useState(false)

  const months = useMemo(() => {
    const txs = buildProfitTransactions(
      leads,
      equipment,
      settings.courses,
      instructors,
    )
    return groupProfitByMonth(txs)
  }, [leads, equipment, settings.courses, instructors])

  const [expanded, setExpanded] = useState<string | null>(null)

  // Expand newest month when opening
  const activeMonth =
    expanded ?? (open && months[0] ? months[0].monthKey : null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setExpanded(null)
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className={cn(
              "size-8 shrink-0 rounded-full",
              onPrimaryBackground
                ? "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            aria-label="היסטוריית הכנסות ורווחים"
          >
            <History className="size-4" />
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85dvh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border p-4 text-right">
          <DialogTitle className="flex items-center gap-2 text-right">
            <History className="size-4 text-primary" />
            היסטוריית הכנסות ורווחים
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {months.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              עדיין אין עסקאות סגורות להצגה
            </p>
          ) : (
            <div className="space-y-2">
              {months.map((month) => {
                const isOpen = activeMonth === month.monthKey
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
                          label="הכנסות"
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
                          <Link
                            key={`${tx.kind}-${tx.id}`}
                            href={profitTransactionHref(tx)}
                            onClick={() => setOpen(false)}
                            className="block rounded-xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {tx.itemLabel}
                                </p>
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
                                <p className="text-muted-foreground">מחיר</p>
                                <p className="font-semibold">
                                  {formatCurrency(tx.revenue)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">הוצאה</p>
                                <p className="font-semibold">
                                  {formatCurrency(tx.expenses)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">רווח</p>
                                <p
                                  className={cn(
                                    "font-bold",
                                    tx.netProfit >= 0
                                      ? "text-success"
                                      : "text-destructive",
                                  )}
                                >
                                  {formatCurrency(tx.netProfit)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function profitTransactionHref(tx: ProfitTransaction): string {
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
