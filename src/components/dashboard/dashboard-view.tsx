"use client"

import Link from "next/link"
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Flame,
  Music2,
  Plus,
  Share2,
  Star,
  TrendingDown,
  TrendingUp,
  Video,
  Wallet,
} from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { ProfitHistoryDialog } from "@/components/dashboard/profit-history-dialog"
import { StandaloneSalesButton } from "@/components/dashboard/standalone-sales-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"
import { formatCurrency, formatDate } from "@/lib/helpers"

export function DashboardView() {
  const { leads, tasks, settings } = useApp()

  const activeLeads = leads.filter((l) => l.status !== "lost")
  // רווח בדשבורד — רק הדרכות בסטטוס "הדרכה בוצעה"
  const doneLeads = activeLeads.filter((l) => l.status === "done")
  const courseIncome = doneLeads.reduce((s, l) => s + l.totalPrice, 0)
  const salesIncome = doneLeads.reduce(
    (s, l) =>
      s +
      (l.trainingSales || []).reduce(
        (a, sale) => a + sale.unitSellingPrice * sale.quantity,
        0,
      ),
    0,
  )
  const income = courseIncome + salesIncome
  const courseExpenses = doneLeads.reduce(
    (s, l) => s + l.expenses.reduce((a, e) => a + e.amount, 0),
    0,
  )
  const salesCost = doneLeads.reduce(
    (s, l) =>
      s +
      (l.trainingSales || []).reduce(
        (a, sale) => a + sale.unitCostPrice * sale.quantity,
        0,
      ),
    0,
  )
  const expenses = courseExpenses + salesCost
  const netProfit = income - expenses
  const closedCourses = activeLeads.filter((l) =>
    ["closed", "done", "pending_certificates", "completed"].includes(l.status),
  ).length
  const onDeck = activeLeads.filter((l) => l.status === "new").length

  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = tasks.filter((t) => !t.done && t.date <= today)

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

      <div className="space-y-5 p-4 md:mx-auto md:max-w-6xl md:p-6 lg:grid lg:max-w-none lg:grid-cols-12 lg:gap-6 lg:space-y-0">
        {/* מטריקות פיננסיות */}
        <section className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
          <Card className="col-span-2 gap-0 border-none bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/20 lg:col-span-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm opacity-90">
                <Wallet className="size-4" />
                רווח נקי (החודש)
              </div>
              <ProfitHistoryDialog />
            </div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight">
              {formatCurrency(netProfit)}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1">
                <TrendingUp className="size-3.5" /> הכנסות {formatCurrency(income)}
              </span>
              <span className="flex items-center gap-1 opacity-90">
                <TrendingDown className="size-3.5" /> הוצאות{" "}
                {formatCurrency(expenses)}
              </span>
            </div>
          </Card>

          <StatCard
            icon={CheckCircle2}
            label="קורסים שנסגרו"
            value={closedCourses}
            tone="success"
          />
          <StatCard
            icon={Flame}
            label="על הפרק"
            value={onDeck}
            tone="primary"
          />
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
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone: "primary" | "success"
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : "bg-primary/10 text-primary"
  return (
    <Card className="gap-0 p-4">
      <div
        className={`mb-2 flex size-9 items-center justify-center rounded-full ${toneClass}`}
      >
        <Icon className="size-5" />
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
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
