"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Navigation,
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
  instructorPayAmount,
  whatsappLink,
  whatsappSummary,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
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
  const [lmsOpen, setLmsOpen] = useState(false)
  const [bookletOpen, setBookletOpen] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>("home")
  const touchX = useRef<number | null>(null)

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

  const canCollectParticipants =
    lead.status === "closed" || lead.status === "done"

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

  const openLms = () => {
    const username = lead.email?.split("@")[0] || lead.phone
    toast.success(
      `נוצר משתמש LMS: ${username} · סיסמה זמנית: Temp${Math.floor(1000 + Math.random() * 9000)}`,
    )
    setLmsOpen(true)
  }

  const syncCalendar = () => {
    if (!lead.date || !lead.time) {
      toast.error("יש להגדיר תאריך ושעה לפני הוספה ליומן")
      return
    }
    downloadLeadIcs(lead)
    toast.success("קובץ היומן נפתח — שמרו את האירוע ביומן")
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 56) return
    const idx = DETAIL_TABS.indexOf(detailTab)
    if (dx > 0 && idx > 0) setDetailTab(DETAIL_TABS[idx - 1])
    else if (dx < 0 && idx < DETAIL_TABS.length - 1)
      setDetailTab(DETAIL_TABS[idx + 1])
  }

  return (
    <div className={cn("flex min-h-0 flex-col bg-background", embedded && "md:h-full")}>
      <Tabs
        value={detailTab}
        onValueChange={(v) => setDetailTab(v as DetailTab)}
        dir="rtl"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        {/* —— Sticky compact header + tabs —— */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-card/95 backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2.5 md:px-4">
            {embedded ? (
              <Link
                href="/leads"
                aria-label="חזרה לרשימה"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground md:hidden"
              >
                <ArrowRight className="size-5" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                aria-label="חזרה"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <ArrowRight className="size-5" />
              </button>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-bold text-foreground md:text-lg">
                  {lead.name}
                </h1>
                <LeadStatusBadge status={lead.status} />
              </div>
              <p className="truncate text-xs text-muted-foreground">{courseLabel}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <IconAction
                href={`tel:${lead.phone}`}
                label="חיוג"
                className="bg-primary/10 text-primary"
              >
                <Phone className="size-4" />
              </IconAction>
              <IconAction
                href={whatsappLink(lead.phone)}
                label="וואטסאפ"
                external
                className="bg-success/10 text-success"
              >
                <MessageCircle className="size-4" />
              </IconAction>
              <button
                type="button"
                onClick={syncCalendar}
                aria-label="הכנס ללו״ז"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground active:scale-95 transition-transform"
              >
                <CalendarPlus className="size-4" />
              </button>
              <Button
                size="icon"
                variant="ghost"
                nativeButton={false}
                className="size-9 rounded-full"
                render={
                  <Link href={`/leads/${lead.id}/edit`} aria-label="עריכה">
                    <Pencil className="size-4" />
                  </Link>
                }
              />
            </div>
          </div>

          <TabsList className="h-auto w-full justify-stretch gap-0.5 rounded-none border-0 bg-secondary/40 p-1.5">
            <TopTab value="home" icon={LayoutDashboard} label="ראשי" />
            <TopTab value="participants" icon={Users} label="משתתפים" />
            <TopTab value="materials" icon={BookOpen} label="חומרי הדרכה" />
            <TopTab value="finance" icon={Wallet} label="כספים ומכירות" />
          </TabsList>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <TabsContent value="home" className="m-0 space-y-4 p-4 md:p-6">
            <HomeTab
              lead={lead}
              addressLine={addressLine}
              wazeUrl={wazeUrl}
              canCollect={canCollectParticipants}
              onCollect={() => setCollectOpen(true)}
            />
          </TabsContent>

          <TabsContent value="participants" className="m-0 space-y-4 p-4 md:p-6">
            <ParticipantsTab
              lead={lead}
              canCollect={canCollectParticipants}
              onCollect={() => setCollectOpen(true)}
            />
          </TabsContent>

          <TabsContent value="materials" className="m-0 space-y-4 p-4 md:p-6">
            <MaterialsTab
              lmsOpen={lmsOpen}
              onBooklet={() => setBookletOpen(true)}
              onStatic={sendStaticMaterial}
              onPresentation={() => sendFile("מצגת", course?.presentationUrl)}
              onCopySummary={copySummary}
              onSendSummary={() =>
                window.open(whatsappLink(lead.phone, summaryText()), "_blank")
              }
              onLms={openLms}
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
        "flex size-9 items-center justify-center rounded-full active:scale-95 transition-transform",
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
  canCollect,
  onCollect,
}: {
  lead: Lead
  addressLine: string
  wazeUrl: string | null
  canCollect: boolean
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
          <Info label="מדריך" value={lead.instructor || "—"} />
          <Info
            label="משתתפים משוער"
            value={String(lead.participantsCount || "—")}
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
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-sm active:scale-95 transition-transform"
            >
              <Navigation className="size-5" />
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

      {canCollect && (
        <Button
          className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
          onClick={onCollect}
        >
          <UserPlus className="size-5" />
          הוסף משתתפים
        </Button>
      )}
    </>
  )
}

function ParticipantsTab({
  lead,
  canCollect,
  onCollect,
}: {
  lead: Lead
  canCollect: boolean
  onCollect: () => void
}) {
  return (
    <>
      <Card className="gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-bold">כלי רישום משתתפים</h2>
        <p className="text-xs text-muted-foreground">
          QR, העתקת קישור ושליחה בוואטסאפ — כולל בקשת דירוג בגוגל
        </p>
        {canCollect ? (
          <Button
            className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
            onClick={onCollect}
          >
            <UserPlus className="size-5" />
            פתח אפשרויות רישום
          </Button>
        ) : (
          <p className="rounded-2xl bg-secondary/50 px-3 py-3 text-center text-xs text-muted-foreground">
            כלי הרישום זמינים לאחר שההדרכה בסטטוס ״נסגר / נרשם ביומן״ או ״הדרכה
            בוצעה״
          </p>
        )}
      </Card>

      <ParticipantsSection lead={lead} />
    </>
  )
}

function MaterialsTab({
  lmsOpen,
  onBooklet,
  onStatic,
  onPresentation,
  onCopySummary,
  onSendSummary,
  onLms,
}: {
  lmsOpen: boolean
  onBooklet: () => void
  onStatic: (key: CourseMaterialKey, label: string) => void
  onPresentation: () => void
  onCopySummary: () => void
  onSendSummary: () => void
  onLms: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
      <ActionButton
        icon={UserPlus}
        label="פתח משתמש LMS"
        onClick={onLms}
        highlight={lmsOpen}
      />
    </div>
  )
}

function FinanceTab({ lead }: { lead: Lead }) {
  const sales = lead.trainingSales || []
  const salesIncome = sales.reduce(
    (s, x) => s + x.unitSellingPrice * x.quantity,
    0,
  )
  const salesCost = sales.reduce((s, x) => s + x.unitCostPrice * x.quantity, 0)
  const expensesTotal = lead.expenses.reduce((s, e) => s + e.amount, 0)
  const instructorFee = instructorPayAmount(lead)
  const coursePrice = lead.totalPrice || 0
  const net =
    coursePrice + salesIncome - expensesTotal - (salesCost > 0 ? salesCost : 0)

  return (
    <>
      <Card className="gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">סיכום רווח הדרכה</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="מחיר הדרכה" value={formatCurrency(coursePrice)} />
          <Info label="מכירות ציוד" value={formatCurrency(salesIncome)} />
          <Info label="הוצאות" value={formatCurrency(expensesTotal)} />
          <Info
            label="עלות מדריך"
            value={formatCurrency(instructorFee)}
          />
        </div>
        <div className="rounded-2xl bg-card px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">רווח משוער: </span>
          <strong className="text-primary">{formatCurrency(net)}</strong>
          {salesCost > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              כולל ניכוי עלות מלאי {formatCurrency(salesCost)}
            </p>
          )}
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
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "font-bold text-primary" : "font-medium"}>{value}</p>
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
