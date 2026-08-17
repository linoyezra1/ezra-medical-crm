"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Flame,
  Music2,
  Plus,
  Share2,
  Star,
  Video,
  Wallet,
} from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { ProfitHistoryDialog } from "@/components/dashboard/profit-history-dialog"
import { StandaloneSalesButton } from "@/components/dashboard/standalone-sales-button"
import { ExternalParticipantDialog } from "@/components/leads/external-participant-dialog"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"
import { formatCurrency, formatDate, isOpenTask } from "@/lib/helpers"
import { computeCurrentMonthRealizedKpi } from "@/lib/profit-history"
import { computeDashboardKpis } from "@/lib/training-profit"
import { cn } from "@/lib/utils"

export function DashboardView() {
  const { leads, tasks, settings, instructors, equipment } = useApp()
  const [externalOpen, setExternalOpen] = useState(false)

  const kpis = useMemo(
    () => computeDashboardKpis(leads, instructors),
    [leads, instructors],
  )

  const realizedMonth = useMemo(
    () =>
      computeCurrentMonthRealizedKpi(
        leads,
        equipment,
        settings.courses,
        instructors,
      ),
    [leads, equipment, settings.courses, instructors],
  )

  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = tasks.filter(
    (t) => isOpenTask(t) && (!t.date || t.date <= today),
  )

  const socials = [
    { name: "טיקטוק", icon: Music2, url: settings.tiktokUrl?.trim() || "" },
    { name: "פייסבוק", icon: Share2, url: settings.facebookUrl?.trim() || "" },
    { name: "אינסטגרם", icon: Video, url: settings.instagramUrl?.trim() || "" },
  ]

  return (
    <div>
      <PageHeader
        title="שלום, בוקר טוב"
        subtitle={settings.businessName}
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
              className="size-10 rounded-full shrink-0"
              render={
                <Link href="/leads/new" aria-label="ליד חדש">
                  <Plus className="size-5" />
                </Link>
              }
            />
          </div>
        }
      />

      <div className="space-y-5 p-4 md:mx-auto md:max-w-6xl md:p-6 lg:grid lg:max-w-none lg:grid-cols-12 lg:gap-6 lg:space-y-0">
        {/* מטריקות פיננסיות — רווח נקי · נסגרו · על הפרק */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-12">
          <KpiCard
            icon={Wallet}
            label={`רווח נקי · ${realizedMonth.monthLabel}`}
            primary={formatCurrency(realizedMonth.netProfit)}
            subtitle={
              <>
                מתוך{" "}
                <span className="font-semibold">
                  {realizedMonth.paidCoursesCount}
                </span>{" "}
                קורסים עם תקבולים
              </>
            }
            tone="featured"
            headerAction={<ProfitHistoryDialog onPrimaryBackground />}
          />

          <Link href="/leads?status=closed" className="block">
            <KpiCard
              icon={CheckCircle2}
              label="נסגרו ביומן"
              primary={String(kpis.booked.count)}
              subtitle={
                <>
                  רווח צפוי:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(kpis.booked.expectedNetProfit)}
                  </span>
                </>
              }
              tone="success"
              clickable
            />
          </Link>

          <Link href="/leads?status=new" className="block">
            <KpiCard
              icon={Flame}
              label="על הפרק"
              primary={String(kpis.pipeline.count)}
              subtitle={
                <>
                  רווח צפוי:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(kpis.pipeline.expectedNetProfit)}
                  </span>
                </>
              }
              tone="primary"
              clickable
            />
          </Link>
        </section>

        {/* משימות היום */}
        <section className="lg:col-span-7">
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle icon={CalendarClock} title="המשימות שלי" />
            <Link
              href="/calendar"
              className="text-xs font-medium text-primary"
            >
              לכל היומן
            </Link>
          </div>
          <div className="space-y-2">
            {todayTasks.length === 0 && (
              <Card className="p-4 text-center text-sm text-muted-foreground">
                אין משימות פתוחות להיום
              </Card>
            )}
            {todayTasks.map((t) => (
              <Card key={t.id} className="flex-row items-center gap-3 p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {t.time || "היום"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.assignee} · {formatDate(t.date)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* שיווק ברשתות + מכירות עצמאיות */}
        <section className="lg:col-span-5">
          <SectionTitle title="שיתוף וקידום" />
          <Card className="mx-auto max-w-none p-4 md:max-w-xl lg:max-w-none">
            <p className="mb-3 text-xs text-muted-foreground">
              שתפו את הקישורים שלכם ישירות לוואטסאפ
            </p>
            <div className="grid grid-cols-4 gap-2 md:grid-cols-5">
              <StandaloneSalesButton />
              {settings.googleReviewUrl?.trim() ? (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `נשמח אם תוכל לדרג אותנו בגוגל בקישור הבא:\n${settings.googleReviewUrl.trim()}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-xs font-medium active:scale-95 transition-transform"
                >
                  <Star className="size-6 fill-amber-500 text-amber-500" />
                  גוגל
                </a>
              ) : (
                <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-secondary/30 p-3 text-xs font-medium opacity-50">
                  <Star className="size-6 text-muted-foreground" />
                  גוגל
                </div>
              )}
              {socials.map((s) => {
                const Icon = s.icon
                const profileUrl = s.url
                const href = profileUrl
                  ? `https://wa.me/?text=${encodeURIComponent(profileUrl)}`
                  : undefined
                return (
                  <a
                    key={s.name}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!profileUrl}
                    onClick={(e) => {
                      if (!profileUrl) e.preventDefault()
                    }}
                    className={
                      "flex flex-col items-center gap-1 rounded-2xl border border-border bg-secondary/40 p-3 text-xs font-medium active:scale-95 transition-transform " +
                      (!profileUrl ? "pointer-events-none opacity-50" : "")
                    }
                  >
                    <Icon className="size-6 text-primary" />
                    {s.name}
                  </a>
                )
              })}
            </div>
          </Card>
        </section>

        <Button
          variant="outline"
          nativeButton={false}
          className="w-full justify-between rounded-2xl py-6 lg:col-span-12 md:max-w-md"
          render={
            <Link href="/settings">
              הגדרות עסק וקישורים
              <ArrowLeft className="size-4" />
            </Link>
          }
        />
      </div>
      <ExternalParticipantDialog
        open={externalOpen}
        onOpenChange={setExternalOpen}
      />
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  primary,
  subtitle,
  tone,
  clickable,
  headerAction,
}: {
  icon: React.ElementType
  label: string
  primary: string
  subtitle: React.ReactNode
  tone: "primary" | "success" | "featured"
  clickable?: boolean
  headerAction?: React.ReactNode
}) {
  const isFeatured = tone === "featured"
  const toneClass = isFeatured
    ? "bg-primary-foreground/15 text-primary-foreground"
    : tone === "success"
      ? "bg-success/10 text-success"
      : "bg-primary/10 text-primary"
  return (
    <Card
      className={cn(
        "gap-0 p-4",
        clickable && !isFeatured && "transition-colors hover:bg-secondary/40",
        isFeatured &&
          "border-none bg-primary text-primary-foreground shadow-lg shadow-primary/20",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            toneClass,
          )}
        >
          <Icon className="size-5" />
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      <div
        className={cn(
          "text-2xl font-extrabold tracking-tight",
          isFeatured && "text-3xl",
        )}
      >
        {primary}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xs font-medium",
          isFeatured ? "text-primary-foreground/90" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <p
        className={cn(
          "mt-2 text-xs",
          isFeatured ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {subtitle}
      </p>
    </Card>
  )
}

function SectionTitle({
  icon: Icon,
  title,
  tone,
}: {
  icon?: React.ElementType
  title: string
  tone?: "destructive"
}) {
  return (
    <h2
      className={`mb-2 flex items-center gap-2 text-sm font-bold ${
        tone === "destructive" ? "text-destructive" : "text-foreground"
      }`}
    >
      {Icon && <Icon className="size-4" />}
      {title}
    </h2>
  )
}
