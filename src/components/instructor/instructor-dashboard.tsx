"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  BookOpen,
  Loader2,
  LogOut,
  MapPin,
  MonitorPlay,
  Package,
  RefreshCw,
  Users,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { InstructorReportSaleDialog } from "@/components/instructor/instructor-report-sale-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  fetchInstructorDashboard,
  instructorLogout,
  type InstructorDashboardData,
  type InstructorTrainingCard,
} from "@/lib/instructor-actions"
import { formatCurrency, formatDateWithWeekday } from "@/lib/helpers"
import { cn } from "@/lib/utils"

type Filter = "upcoming" | "completed"

export function InstructorDashboard() {
  const [data, setData] = useState<InstructorDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [reportLead, setReportLead] = useState<InstructorTrainingCard | null>(
    null,
  )

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchInstructorDashboard()
    setLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setData(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const logout = async () => {
    await instructorLogout()
    window.location.href = "/instructor/login"
  }

  const list =
    filter === "upcoming" ? data?.upcoming ?? [] : data?.completed ?? []

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-right">
            <p className="text-xs text-muted-foreground">שלום,</p>
            <p className="truncate text-lg font-bold">
              {data?.instructor.name || "מדריך"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 rounded-full"
              aria-label="רענון"
              onClick={() => void load()}
            >
              <RefreshCw className={cn("size-5", loading && "animate-spin")} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 rounded-full text-destructive"
              aria-label="יציאה"
              onClick={() => void logout()}
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-4 p-4 pb-8">
        {data && (
          <Card className="gap-0 overflow-hidden border-none bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/20">
            <p className="mb-3 text-sm font-semibold text-primary-foreground/90">
              סיכום שכר
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi
                label="סך שכר הדרכות"
                value={formatCurrency(data.kpis.trainingFees)}
              />
              <Kpi
                label="עמלות מכירה שנצברו"
                value={formatCurrency(data.kpis.salesCommissions)}
              />
              <Kpi
                label="סך שכר כולל"
                value={formatCurrency(data.kpis.totalCompensation)}
                highlight
              />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-1">
          <button
            type="button"
            className={cn(
              "min-h-12 rounded-lg px-3 text-sm font-semibold transition-colors",
              filter === "upcoming"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setFilter("upcoming")}
          >
            הדרכות קרובות
          </button>
          <button
            type="button"
            className={cn(
              "min-h-12 rounded-lg px-3 text-sm font-semibold transition-colors",
              filter === "completed"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setFilter("completed")}
          >
            הדרכות שהסתיימו
          </button>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            אין הדרכות בקטגוריה זו
          </p>
        ) : (
          list.map((lead) => (
            <TrainingCard
              key={lead.id}
              lead={lead}
              commissionPct={data?.instructor.salesCommissionPercentage ?? 0}
              onReportSale={() => setReportLead(lead)}
            />
          ))
        )}
      </div>

      {reportLead && data && (
        <InstructorReportSaleDialog
          open={!!reportLead}
          onOpenChange={(o) => {
            if (!o) setReportLead(null)
          }}
          lead={reportLead}
          inventory={data.inventory}
          commissionPct={data.instructor.salesCommissionPercentage}
          onSuccess={() => {
            setReportLead(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl bg-primary-foreground/10 px-3 py-2.5">
      <p className="text-[11px] text-primary-foreground/75">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-bold tabular-nums",
          highlight ? "text-xl" : "text-base",
        )}
      >
        {value}
      </p>
    </div>
  )
}

function TrainingCard({
  lead,
  commissionPct,
  onReportSale,
}: {
  lead: InstructorTrainingCard
  commissionPct: number
  onReportSale: () => void
}) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-right">
          <p className="font-bold leading-snug">{lead.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateWithWeekday(lead.date)}
            {lead.time
              ? ` · ${lead.time}${lead.endTime ? `–${lead.endTime}` : ""}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
          שכר: {formatCurrency(lead.fee)}
        </span>
      </div>

      <div className="rounded-xl bg-secondary/50 p-3">
        {lead.isZoom ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Video className="size-4 text-sky-700" />
              מפגש בזום
            </p>
            {lead.zoomLink ? (
              <a
                href={lead.zoomLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.open(lead.zoomLink, "_blank", "noopener,noreferrer")
                }}
                className="inline-flex h-8 max-w-full items-center justify-center gap-1.5 rounded-md bg-sky-600 px-2.5 text-xs font-medium text-white active:scale-[0.98]"
              >
                <Video className="size-3.5 shrink-0" />
                הצטרפות לזום
              </a>
            ) : (
              <p className="text-xs text-destructive">חסר קישור זום</p>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">מיקום</p>
              <p className="text-sm font-medium">{lead.addressLine}</p>
            </div>
            {lead.wazeUrl && (
              <a
                href={lead.wazeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="נווט ב-Waze"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.open(lead.wazeUrl, "_blank", "noopener,noreferrer")
                }}
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white shadow-sm active:scale-95"
              >
                <Image
                  src="/WAYS.png"
                  alt="Waze"
                  width={28}
                  height={28}
                  className="size-7 object-contain"
                />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MaterialOpenButton
          href={lead.presentationUrl}
          label="פתח מצגת"
          icon={MonitorPlay}
          missingTitle="לא הוגדר קישור מצגת לקורס זה"
        />
        <MaterialOpenButton
          href={lead.bookletUrl}
          label="פתח חוברת"
          icon={BookOpen}
          missingTitle="לא הוגדרה חוברת לקורס זה"
        />
      </div>

      <Link
        href={`/instructor/training/${lead.id}`}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 active:scale-[0.99]"
      >
        <Users className="size-4" />
        רשימת משתתפים
      </Link>

      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full gap-2 rounded-xl text-sm font-semibold"
        onClick={onReportSale}
      >
        <Package className="size-4" />
        דווח מכירת ציוד
        {commissionPct > 0 && (
          <span className="text-xs text-muted-foreground">
            (עמלה {commissionPct}%)
          </span>
        )}
      </Button>
    </Card>
  )
}

function MaterialOpenButton({
  href,
  label,
  icon: Icon,
  missingTitle,
}: {
  href: string | null
  label: string
  icon: React.ElementType
  missingTitle: string
}) {
  const enabled = Boolean(href?.trim())

  return (
    <button
      type="button"
      disabled={!enabled}
      title={enabled ? label : missingTitle}
      aria-label={enabled ? label : missingTitle}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!href?.trim()) return
        window.open(href, "_blank", "noopener,noreferrer")
      }}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold",
        enabled
          ? "border-primary/20 bg-primary/10 text-primary active:scale-[0.98]"
          : "cursor-not-allowed border-border bg-secondary/40 text-muted-foreground/50",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  )
}
