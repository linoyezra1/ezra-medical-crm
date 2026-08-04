"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  CreditCard,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Presentation,
  Printer,
  Send,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { LeadStatusBadge } from "@/components/status-badge"
import { CollectParticipantsDialog } from "@/components/leads/collect-participants-dialog"
import { LeadPaymentDialog } from "@/components/leads/lead-payment-dialog"
import { LifecycleControls } from "@/components/leads/lifecycle-controls"
import { ExpensesSection } from "@/components/leads/expenses-section"
import { ParticipantsSection } from "@/components/leads/participants-section"
import { TrainingSalesSection } from "@/components/leads/training-sales-section"
import { SendBookletDialog } from "@/components/leads/send-booklet-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  courseMaterialUrl,
  type CourseMaterialKey,
} from "@/lib/course-materials"
import {
  findCourseCatalog,
  formatLeadCourseType,
} from "@/lib/course-type"
import {
  formatCurrency,
  formatDateWithWeekday,
  downloadLeadIcs,
  instructorAssignmentWhatsAppMessage,
  whatsappLink,
  whatsappSummary,
} from "@/lib/helpers"
import { formatActivityLogLine } from "@/lib/activity-log"
import { isInstructorUnassigned } from "@/lib/instructor"
import { useApp } from "@/lib/store"
import { computeTrainingProfit } from "@/lib/training-profit"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Lead } from "@/lib/types"

const DETAIL_TABS = ["home", "participants", "materials", "finance"] as const
type DetailTab = (typeof DETAIL_TABS)[number]

export function LeadDetailView({
  leadId,
  embedded = false,
}: {
  leadId: string
  embedded?: boolean
}) {
  const router = useRouter()
  const { getLead, settings } = useApp()
  const lead = getLead(leadId)
  const [bookletOpen, setBookletOpen] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>("home")

  if (!lead) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        הליד לא נמצא.{" "}
        <Link href="/leads" className="text-primary underline">
          חזרה לרשימה
        </Link>
      </div>
    )
  }

  const course = findCourseCatalog(lead.courseType, settings.courses)
  const courseLabel = formatLeadCourseType(lead, settings.courses)

  const addressLine = [
    lead.address.street,
    lead.address.houseNumber,
    lead.address.city,
  ]
    .filter(Boolean)
    .join(" ")

  const wazeUrl = addressLine
    ? `https://waze.com/ul?q=${encodeURIComponent(addressLine)}&navigate=yes`
    : null

  const summaryText = () => whatsappSummary(lead, course)

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText())
      toast.success("סיכום השיחה הועתק")
    } catch {
      toast.error("לא ניתן להעתיק")
    }
  }

  const sendFile = (label: string, url?: string) => {
    if (!url) {
      toast.error(`לא הוגדר ${label} לקורס זה`)
      return
    }
    const text = `${label} - ${courseLabel}\n${url}`
    window.open(whatsappLink(lead.phone, text), "_blank")
  }

  const sendStaticMaterial = (key: CourseMaterialKey, label: string) => {
    const url = courseMaterialUrl(key)
    const name = lead.contactName?.trim() || lead.name
    const text = `היי ${name}, מצורף קישור להורדת ${label}:\n${url}`
    window.open(whatsappLink(lead.phone, text), "_blank", "noopener,noreferrer")
  }

  const syncCalendar = () => {
    if (!lead.date || !lead.time) {
      toast.error("יש להגדיר תאריך ושעה לפני הוספה ליומן")
      return
    }
    downloadLeadIcs(lead)
    toast.success("קובץ היומן נפתח — שמרו את האירוע ביומן")
  }

  return (
    <div className={cn("flex min-h-0 flex-col bg-background", embedded && "md:h-full")}>
      <Tabs
        value={detailTab}
        onValueChange={(v) => setDetailTab(v as DetailTab)}
        dir="rtl"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="sticky top-0 z-30 shrink-0">
          {/* —— Expanded action header (separated from tabs) —— */}
          <header className="border-b border-slate-200/80 bg-slate-50/90 px-5 py-4 shadow-sm backdrop-blur-md md:px-6 md:py-5">
            {embedded && (
              <Link
                href="/leads"
                className="mb-3 hidden w-fit items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary md:inline-flex"
              >
                <ArrowRight className="size-4 shrink-0" />
                חזרה לכלל הלידים וההדרכות
              </Link>
            )}

            <div className="flex items-start gap-3">
              {embedded ? (
                <Link
                  href="/leads"
                  aria-label="חזרה לרשימה"
                  className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-secondary-foreground shadow-sm md:hidden"
                >
                  <ArrowRight className="size-5" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => router.back()}
                  aria-label="חזרה"
                  className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-secondary-foreground shadow-sm"
                >
                  <ArrowRight className="size-5" />
                </button>
              )}

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">
                    {lead.name}
                  </h1>
                  <LeadStatusBadge
                    status={lead.status}
                    className="px-3.5 py-1.5 text-sm font-bold shadow-sm"
                  />
                </div>
                <p className="truncate text-sm font-medium text-muted-foreground md:text-base">
                  {courseLabel}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3 md:gap-4">
              <IconAction
                href={`tel:${lead.phone}`}
                label="חיוג"
                className="bg-white/80 text-primary shadow-sm"
              >
                <Phone className="size-6" />
              </IconAction>
              <IconAction
                href={whatsappLink(lead.phone)}
                label="וואטסאפ"
                external
                className="bg-white/80 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/whatsapp.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
              </IconAction>
              <button
                type="button"
                onClick={() => setPaymentOpen(true)}
                aria-label="רישום תשלום"
                className="flex size-12 items-center justify-center rounded-full bg-white/80 p-3 text-foreground shadow-sm active:scale-95 transition-transform"
              >
                <CreditCard className="size-6" />
              </button>
              <button
                type="button"
                onClick={syncCalendar}
                aria-label="הכנס ללו״ז"
                className="flex size-12 items-center justify-center rounded-full bg-white/80 p-3 text-foreground shadow-sm active:scale-95 transition-transform"
              >
                <CalendarPlus className="size-6" />
              </button>
              <Link
                href={`/leads/${lead.id}/edit`}
                aria-label="עריכה"
                className="flex size-12 items-center justify-center rounded-full bg-white/80 p-3 text-foreground shadow-sm active:scale-95 transition-transform"
              >
                <Pencil className="size-6" />
              </Link>
            </div>
          </header>

          {/* —— Tab bar (click/tap only — no swipe) —— */}
          <TabsList className="h-auto w-full justify-stretch gap-0.5 rounded-none border-b border-border bg-card p-1.5">
            <TopTab value="home" icon={LayoutDashboard} label="ראשי" />
            <TopTab value="participants" icon={Users} label="משתתפים" />
            <TopTab value="materials" icon={BookOpen} label="חומרי הדרכה" />
            <TopTab value="finance" icon={Wallet} label="כספים ומכירות" />
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="home" className="m-0 space-y-4 p-4 md:p-6">
            <HomeTab
              lead={lead}
              addressLine={addressLine}
              wazeUrl={wazeUrl}
              onCollect={() => setCollectOpen(true)}
            />
          </TabsContent>

          <TabsContent value="participants" className="m-0 space-y-4 p-4 md:p-6">
            <ParticipantsTab
              lead={lead}
              onCollect={() => setCollectOpen(true)}
            />
          </TabsContent>

          <TabsContent value="materials" className="m-0 space-y-4 p-4 md:p-6">
            <MaterialsTab
              lead={lead}
              courseLabel={courseLabel}
              onBooklet={() => setBookletOpen(true)}
              onStatic={sendStaticMaterial}
              onPresentation={() => sendFile("מצגת", course?.presentationUrl)}
              onCopySummary={copySummary}
              onSendSummary={() =>
                window.open(whatsappLink(lead.phone, summaryText()), "_blank")
              }
            />
          </TabsContent>

          <TabsContent value="finance" className="m-0 space-y-4 p-4 md:p-6">
            <FinanceTab lead={lead} />
          </TabsContent>
        </div>
      </Tabs>

      <CollectParticipantsDialog
        lead={lead}
        open={collectOpen}
        onOpenChange={setCollectOpen}
      />
      <LeadPaymentDialog
        lead={lead}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
      <SendBookletDialog
        lead={lead}
        open={bookletOpen}
        onOpenChange={setBookletOpen}
      />
    </div>
  )
}

function TopTab({
  value,
  icon: Icon,
  label,
}: {
  value: string
  icon: React.ElementType
  label: string
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex flex-1 flex-col gap-0.5 rounded-xl px-1 py-2 text-[10px] leading-tight data-active:bg-card data-active:shadow-sm sm:text-[11px]"
    >
      <Icon className="size-4 shrink-0" />
      <span className="line-clamp-2 text-center">{label}</span>
    </TabsTrigger>
  )
}

function IconAction({
  href,
  label,
  children,
  external,
  className,
}: {
  href: string
  label: string
  children: React.ReactNode
  external?: boolean
  className?: string
}) {
  return (
    <a
      href={href}
      aria-label={label}
      {...(external
        ? { target: "_blank", rel: "noreferrer" as const }
        : {})}
      className={cn(
        "flex size-12 items-center justify-center rounded-full p-3 active:scale-95 transition-transform",
        className,
      )}
    >
      {children}
    </a>
  )
}

function HomeTab({
  lead,
  addressLine,
  wazeUrl,
  onCollect,
}: {
  lead: Lead
  addressLine: string
  wazeUrl: string | null
  onCollect: () => void
}) {
  return (
    <>
      <Card className="gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Info
            label="תאריך"
            value={lead.date ? formatDateWithWeekday(lead.date) : "—"}
          />
          <Info
            label="שעה"
            value={
              lead.time
                ? `${lead.time}${lead.endTime ? `–${lead.endTime}` : ""}`
                : "—"
            }
          />
          <Info
            label="מדריך"
            value={
              isInstructorUnassigned(lead.instructor)
                ? "לא שובץ מדריך"
                : lead.instructor || "—"
            }
            valueClassName={
              isInstructorUnassigned(lead.instructor)
                ? "font-bold text-red-600"
                : undefined
            }
          />
          <Info
            label="משתתפים משוער"
            value={String(lead.participantsCount || "—")}
          />
          <Info
            label="מפגשים"
            value={String(
              lead.sessionsCount ||
                lead.sessions?.length ||
                (lead.date ? 1 : "—"),
            )}
          />
          <Info
            label="סוג"
            value={lead.isPrivateCourse ? "קורס פרטי" : "קבוצה"}
            valueClassName={
              lead.isPrivateCourse ? "font-semibold text-pink-600" : undefined
            }
          />
        </div>

        <div className="flex items-start gap-3 rounded-2xl bg-secondary/50 p-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">כתובת</p>
            <p className="text-sm font-medium leading-snug">
              {addressLine || "לא הוגדרה כתובת"}
              {lead.address.zip ? ` (${lead.address.zip})` : ""}
            </p>
          </div>
          {wazeUrl && (
            <a
              href={wazeUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="נווט ב‑Waze"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/90 p-2.5 shadow-sm active:scale-95 transition-transform"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/WAYS.png"
                alt="Waze"
                width={28}
                height={28}
                className="size-7 object-contain"
              />
            </a>
          )}
        </div>

        {lead.notes && (
          <p className="rounded-2xl bg-amber-50/80 px-3 py-2.5 text-xs text-muted-foreground">
            {lead.notes}
          </p>
        )}
      </Card>

      <LifecycleControls lead={lead} hideParticipantsManage />

      <Card className="gap-2 rounded-2xl border border-border/80 bg-card p-4 shadow-sm text-sm">
        <h2 className="text-sm font-bold text-foreground">מעקב משתמשים</h2>
        <p className="text-muted-foreground">
          נוצר על ידי:{" "}
          <span className="font-medium text-foreground">
            {lead.createdBy || "—"}
          </span>
        </p>
        <p className="text-muted-foreground">
          עודכן לאחרונה על ידי:{" "}
          <span className="font-medium text-foreground">
            {lead.lastUpdatedBy || "—"}
          </span>
        </p>
        {(lead.status === "closed" || lead.closedBy) && (
          <p className="text-muted-foreground">
            העסקה נסגרה על ידי:{" "}
            <span className="font-medium text-foreground">
              {lead.closedBy || "—"}
            </span>
          </p>
        )}
      </Card>

      <Card className="gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">היסטוריית שינויים</h2>
        {(lead.activityLogs || []).length === 0 ? (
          <p className="text-xs text-muted-foreground">אין שינויים מתועדים עדיין</p>
        ) : (
          <ul className="space-y-2">
            {(lead.activityLogs || []).map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-foreground"
              >
                {formatActivityLogLine(entry)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button
        className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
        onClick={onCollect}
      >
        <UserPlus className="size-5" />
        הוסף משתתפים
      </Button>
    </>
  )
}

function ParticipantsTab({
  lead,
  onCollect,
}: {
  lead: Lead
  onCollect: () => void
}) {
  return (
    <>
      <Card className="gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-bold">כלי רישום משתתפים</h2>
        <p className="text-xs text-muted-foreground">
          QR, העתקת קישור ושליחה בוואטסאפ — כולל בקשת דירוג בגוגל
        </p>
        <Button
          className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
          onClick={onCollect}
        >
          <UserPlus className="size-5" />
          פתח אפשרויות רישום
        </Button>
      </Card>

      <ParticipantsSection lead={lead} />
    </>
  )
}

function MaterialsTab({
  lead,
  courseLabel,
  onBooklet,
  onStatic,
  onPresentation,
  onCopySummary,
  onSendSummary,
}: {
  lead: Lead
  courseLabel: string
  onBooklet: () => void
  onStatic: (key: CourseMaterialKey, label: string) => void
  onPresentation: () => void
  onCopySummary: () => void
  onSendSummary: () => void
}) {
  const shareWithInstructor = () => {
    const registrationUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/p/${lead.id}`
        : `/p/${lead.id}`
    const text = instructorAssignmentWhatsAppMessage(lead, {
      courseLabel,
      registrationUrl,
    })
    window.open(whatsappLink("", text), "_blank", "noopener,noreferrer")
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <ActionButton
        icon={MessageCircle}
        label="שליחה למדריך"
        onClick={shareWithInstructor}
      />
      <ActionButton icon={BookOpen} label="שלח חוברת" onClick={onBooklet} />
      <ActionButton
        icon={Printer}
        label="חוברת להדפסה"
        onClick={() => onStatic("booklet44WordPrint", "חוברת להדפסה (Word)")}
      />
      <ActionButton
        icon={FileText}
        label="מבחן גרסה 1"
        onClick={() => onStatic("exam44v1", "מבחן 44 גרסה 1")}
      />
      <ActionButton
        icon={ClipboardList}
        label="מבחן גרסה 2"
        onClick={() => onStatic("exam44v2", "מבחן 44 גרסה 2")}
      />
      <ActionButton
        icon={FileSpreadsheet}
        label="טבלת משתתפים"
        onClick={() => onStatic("participantsTable", "פורמט טבלת משתתפים")}
      />
      <ActionButton
        icon={Presentation}
        label="קישור מצגת"
        onClick={onPresentation}
      />
      <ActionButton icon={Copy} label="העתק סיכום" onClick={onCopySummary} />
      <ActionButton icon={Send} label="סיכום שיחה" onClick={onSendSummary} />
    </div>
  )
}

function FinanceTab({ lead }: { lead: Lead }) {
  const { instructors } = useApp()
  const profit = computeTrainingProfit(lead, instructors)

  return (
    <>
      <Card className="gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">סיכום רווח הדרכה</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info
            label="מחיר הדרכה"
            value={formatCurrency(profit.coursePrice)}
          />
          <Info
            label="מכירות ציוד"
            value={formatCurrency(profit.salesIncome)}
          />
          <Info
            label="עלות מדריך"
            value={formatCurrency(profit.instructorFee)}
          />
          <Info
            label="הוצאות אחרות"
            value={formatCurrency(profit.otherExpenses)}
          />
        </div>
        <div className="rounded-2xl bg-card px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">רווח נקי: </span>
          <strong className="text-primary">
            {formatCurrency(profit.netProfit)}
          </strong>
        </div>
      </Card>

      <ExpensesSection lead={lead} alwaysOpen />
      <TrainingSalesSection lead={lead} alwaysOpen />
    </>
  )
}

function Info({
  label,
  value,
  strong,
  valueClassName,
}: {
  label: string
  value: string
  strong?: boolean
  valueClassName?: string
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          strong ? "font-bold text-primary" : "font-medium",
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  highlight,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border p-4 text-xs font-medium active:scale-95 transition-transform",
        highlight
          ? "border-success bg-success/10 text-success"
          : "border-border bg-card text-foreground shadow-sm",
      )}
    >
      <Icon className="size-5 text-primary" />
      {label}
    </button>
  )
}
