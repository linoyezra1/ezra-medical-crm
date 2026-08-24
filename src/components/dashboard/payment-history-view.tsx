"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw, Search } from "lucide-react"
import { getAllPaymentTransactionsAction } from "@/lib/actions"
import { formatCurrency, formatDate } from "@/lib/helpers"
import { PAYMENT_METHODS, PAYMENT_RECEIVERS } from "@/lib/payment"
import {
  filterPaymentTransactions,
  PAYMENT_LEDGER_STATUS_LABELS,
  PAYMENT_TRANSACTION_TYPE_LABELS,
  PAYMENT_TRANSACTION_TYPES,
  paymentMethodLabel,
  summarizePaymentTransactions,
  uniqueReceivedByOptions,
  type PaymentLedgerStatus,
  type PaymentTransaction,
  type PaymentTransactionType,
} from "@/lib/payment-transactions"
import {
  buildProfitTransactions,
  type ProfitTransaction,
} from "@/lib/profit-history"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const ALL = "all" as const

const TYPE_BADGE_CLASS: Record<PaymentTransactionType, string> = {
  regular_participant: "bg-sky-100 text-sky-900 border-sky-200",
  external_participant: "bg-violet-100 text-violet-900 border-violet-200",
  training_sale: "bg-amber-100 text-amber-900 border-amber-200",
  standalone_sale: "bg-emerald-100 text-emerald-900 border-emerald-200",
  training_base: "bg-slate-100 text-slate-800 border-slate-200",
}

const STATUS_CLASS: Record<PaymentLedgerStatus, string> = {
  paid: "text-success",
  pending: "text-amber-800",
  cancelled: "text-destructive",
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

/** רווח נקי — אותה לוגיקה כמו בדשבורד (`buildProfitTransactions`), מסונן לפי מסנני העמוד */
function netProfitForPaymentFilters(
  profitTxs: ProfitTransaction[],
  filteredPayments: PaymentTransaction[],
  opts: {
    dateFrom?: string
    dateTo?: string
    hasNonDateFilters: boolean
  },
): number {
  let txs = profitTxs
  if (opts.dateFrom) {
    txs = txs.filter((t) => t.date >= opts.dateFrom!)
  }
  if (opts.dateTo) {
    txs = txs.filter((t) => t.date <= opts.dateTo!)
  }

  if (opts.hasNonDateFilters) {
    const trainingIds = new Set(
      filteredPayments
        .map((p) => p.trainingId)
        .filter((id): id is string => Boolean(id)),
    )
    const equipmentIds = new Set(
      filteredPayments
        .filter((p) => p.id.startsWith("equipment:"))
        .map((p) => p.id.slice("equipment:".length)),
    )
    txs = txs.filter((t) => {
      if (t.kind === "course") return trainingIds.has(t.id)
      if (t.kind === "equipment") return equipmentIds.has(t.id)
      return false
    })
  }

  return txs.reduce((sum, t) => sum + t.netProfit, 0)
}

export function PaymentHistoryView() {
  const { leads, equipment, settings, instructors } = useApp()
  const [rows, setRows] = useState<PaymentTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [type, setType] = useState<PaymentTransactionType | typeof ALL>(ALL)
  const [paymentMethod, setPaymentMethod] = useState<string>(ALL)
  const [receivedBy, setReceivedBy] = useState<string>(ALL)
  const [paymentStatus, setPaymentStatus] = useState<
    PaymentLedgerStatus | typeof ALL
  >(ALL)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getAllPaymentTransactionsAction()
    if (!res.ok) {
      setError(res.error || "שגיאה בטעינה")
      setRows([])
    } else {
      setRows(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      filterPaymentTransactions(rows, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        type,
        paymentMethod,
        receivedBy,
        paymentStatus,
        search,
      }),
    [
      rows,
      dateFrom,
      dateTo,
      type,
      paymentMethod,
      receivedBy,
      paymentStatus,
      search,
    ],
  )

  const summary = useMemo(
    () => summarizePaymentTransactions(filtered),
    [filtered],
  )

  const profitTxs = useMemo(
    () =>
      buildProfitTransactions(
        leads,
        equipment,
        settings.courses,
        instructors,
      ),
    [leads, equipment, settings.courses, instructors],
  )

  const hasNonDateFilters =
    type !== ALL ||
    paymentMethod !== ALL ||
    receivedBy !== ALL ||
    paymentStatus !== ALL ||
    Boolean(search.trim())

  const netProfit = useMemo(
    () =>
      netProfitForPaymentFilters(profitTxs, filtered, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        hasNonDateFilters,
      }),
    [profitTxs, filtered, dateFrom, dateTo, hasNonDateFilters],
  )

  const receivedByOptions = useMemo(() => {
    const fromData = uniqueReceivedByOptions(rows)
    const set = new Set([...PAYMENT_RECEIVERS, ...fromData])
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"))
  }, [rows])

  const hasActiveFilters =
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    type !== ALL ||
    paymentMethod !== ALL ||
    receivedBy !== ALL ||
    paymentStatus !== ALL ||
    Boolean(search.trim())

  function clearFilters() {
    setDateFrom("")
    setDateTo("")
    setType(ALL)
    setPaymentMethod(ALL)
    setReceivedBy(ALL)
    setPaymentStatus(ALL)
    setSearch("")
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          title="היסטוריית תשלומים"
          subtitle="יומן תשלומים שטוח — כל דיווח ומכירה בשורה נפרדת"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 shrink-0"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          רענון
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <SummaryCard
          label="סך הכל נגבה"
          value={formatCurrency(summary.totalCollected)}
          hint={`${summary.count} רשומות לפי סינון`}
          tone="primary"
        />
        <SummaryCard
          label="רווח נקי"
          value={formatCurrency(netProfit)}
          hint="לפי אותה לוגיקה כמו בדשבורד · מסונן לפי המסננים"
          tone={netProfit >= 0 ? "success" : "warning"}
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם משלם או הדרכה…"
            className="pr-9"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="space-y-1 text-xs text-muted-foreground">
            מתאריך
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            עד תאריך
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            סטטוס תשלום
            <select
              className={selectClass}
              value={paymentStatus}
              onChange={(e) =>
                setPaymentStatus(
                  e.target.value === ALL
                    ? ALL
                    : (e.target.value as PaymentLedgerStatus),
                )
              }
            >
              <option value={ALL}>הכל</option>
              <option value="paid">
                {PAYMENT_LEDGER_STATUS_LABELS.paid}
              </option>
              <option value="pending">
                {PAYMENT_LEDGER_STATUS_LABELS.pending}
              </option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            סוג תשלום
            <select
              className={selectClass}
              value={type}
              onChange={(e) =>
                setType(
                  e.target.value === ALL
                    ? ALL
                    : (e.target.value as PaymentTransactionType),
                )
              }
            >
              <option value={ALL}>הכל</option>
              {PAYMENT_TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PAYMENT_TRANSACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            אמצעי תשלום
            <select
              className={selectClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value={ALL}>הכל</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="__none__">לא צוין</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            מי גבה
            <select
              className={selectClass}
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
            >
              <option value={ALL}>הכל</option>
              {receivedByOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__none__">לא צוין</option>
            </select>
          </label>
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              נקה סינון
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          טוען תשלומים…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "עדיין אין תשלומים להצגה"
            : "לא נמצאו רשומות התואמות לסינון"}
        </p>
      ) : (
        <>
          {/* מובייל — כרטיסים */}
          <div className="space-y-2 md:hidden">
            {filtered.map((tx) => (
              <MobileTxCard key={tx.id} tx={tx} />
            ))}
          </div>

          {/* דסקטופ — טבלה */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-right text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">תאריך</th>
                  <th className="px-3 py-2 font-medium">סוג</th>
                  <th className="px-3 py-2 font-medium">שם משלם</th>
                  <th className="px-3 py-2 font-medium">שיוך להדרכה</th>
                  <th className="px-3 py-2 font-medium">אמצעי תשלום</th>
                  <th className="px-3 py-2 font-medium">מי גבה</th>
                  <th className="px-3 py-2 font-medium">נגבה</th>
                  <th className="px-3 py-2 font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-border/70 last:border-0 hover:bg-secondary/20"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <TypeBadge type={tx.type} />
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-medium">
                      {tx.payerName}
                    </td>
                    <td className="max-w-[180px] px-3 py-2.5">
                      <TrainingCell tx={tx} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {paymentMethodLabel(tx.paymentMethod)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {tx.receivedBy}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums">
                      {formatCurrency(Number(tx.amount) || 0)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          STATUS_CLASS[tx.paymentStatus],
                        )}
                      >
                        {PAYMENT_LEDGER_STATUS_LABELS[tx.paymentStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: PaymentTransactionType }) {
  return (
    <Badge
      variant="outline"
      className={cn("border font-medium", TYPE_BADGE_CLASS[type])}
    >
      {PAYMENT_TRANSACTION_TYPE_LABELS[type]}
    </Badge>
  )
}

function TrainingCell({ tx }: { tx: PaymentTransaction }) {
  if (!tx.trainingId) {
    return (
      <span className="text-muted-foreground">
        {tx.trainingName || "מכירה ללא הדרכה"}
      </span>
    )
  }
  return (
    <Link
      href={`/leads/${tx.trainingId}`}
      className="truncate text-primary underline-offset-2 hover:underline"
      title={tx.trainingName}
    >
      {tx.trainingName}
    </Link>
  )
}

function MobileTxCard({ tx }: { tx: PaymentTransaction }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{tx.payerName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(tx.date)} · {paymentMethodLabel(tx.paymentMethod)}
          </p>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-sm font-bold tabular-nums">
            {formatCurrency(Number(tx.amount) || 0)}
          </p>
          <p
            className={cn(
              "text-[11px] font-medium",
              STATUS_CLASS[tx.paymentStatus],
            )}
          >
            {PAYMENT_LEDGER_STATUS_LABELS[tx.paymentStatus]}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TypeBadge type={tx.type} />
        <span className="text-[11px] text-muted-foreground">
          גבה: {tx.receivedBy}
        </span>
      </div>
      <div className="mt-1.5 text-xs">
        <TrainingCell tx={tx} />
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: "primary" | "success" | "muted" | "warning"
}) {
  const valueClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-success"
        : tone === "warning"
          ? "text-amber-800"
          : "text-foreground"
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", valueClass)}>
        {value}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}
