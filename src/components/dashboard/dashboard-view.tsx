"use client"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Flame,
  Music2,
  Plus,
  Share2,
  TrendingDown,
  TrendingUp,
  Video,
  Wallet,
} from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { ProfitHistoryDialog } from "@/components/dashboard/profit-history-dialog"
import { LeadStatusBadge } from "@/components/status-badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatLeadCourseType } from "@/lib/course-type"
import { useApp } from "@/lib/store"
import { formatCurrency, formatDate, whatsappLink } from "@/lib/helpers"

export function DashboardView() {
  const { leads, tasks, settings } = useApp()

  const activeLeads = leads.filter((l) => l.status !== "lost")
  const income = activeLeads
    .filter((l) => l.status !== "new")
    .reduce((s, l) => s + l.totalPrice, 0)
  const expenses = activeLeads.reduce(
    (s, l) => s + l.expenses.reduce((a, e) => a + e.amount, 0),
    0,
  )
  const netProfit = income - expenses
  const closedCourses = activeLeads.filter((l) =>
    ["closed", "done", "pending_certificates", "completed"].includes(l.status),
  ).length
  const onDeck = activeLeads.filter((l) => l.status === "new").length

  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = tasks.filter((t) => !t.done && t.date <= today)
  const urgentLeads = activeLeads.filter(
    (l) => l.urgent && l.status !== "completed",
  )

  const shareText = `היי! הכירו את ${settings.businessName} - הדרכות עזרה ראשונה, בטיחות וציוד. לפרטים ולתיאום:`
  const socials = [
    { name: "טיקטוק", icon: Music2, url: settings.tiktokUrl },
    { name: "פייסבוק", icon: Share2, url: settings.facebookUrl },
    { name: "אינסטגרם", icon: Video, url: settings.instagramUrl },
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

      <div className="space-y-5 p-4">
        {/* מטריקות פיננסיות */}
        <section className="grid grid-cols-2 gap-3">
          <Card className="col-span-2 gap-0 border-none bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/20">
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

        {/* לידים דחופים */}
        {urgentLeads.length > 0 && (
          <section>
            <SectionTitle
              icon={AlertTriangle}
              title="דורש טיפול מיידי"
              tone="destructive"
            />
            <div className="space-y-2">
              {urgentLeads.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`}>
                  <Card className="flex-row items-center justify-between gap-2 border-r-4 border-r-destructive p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
                        <p className="truncate font-semibold">{l.name}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatLeadCourseType(l)}
                      </p>
                    </div>
                    <LeadStatusBadge status={l.status} />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* משימות היום */}
        <section>
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

        {/* שיווק ברשתות */}
        <section>
          <SectionTitle title="שיתוף וקידום" />
          <Card className="p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              שתפו את הקישורים שלכם ישירות לוואטסאפ
            </p>
            <div className="grid grid-cols-3 gap-3">
              {socials.map((s) => {
                const Icon = s.icon
                return (
                  <a
                    key={s.name}
                    href={whatsappLink("", `${shareText}\n${s.url}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/40 p-3 text-xs font-medium active:scale-95 transition-transform"
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
          className="w-full justify-between rounded-2xl py-6"
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
