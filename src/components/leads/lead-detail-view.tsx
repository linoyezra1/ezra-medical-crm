"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowRight,
  CalendarPlus,
  ClipboardPaste,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  MapPin,
  Pencil,
  Phone,
  Send,
  Upload,
  UserPlus,
  Users,
  Video,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { TraineeImportDialog } from "@/components/clients/trainee-import-dialog"
import { InstructorAssignmentWidget } from "@/components/instructors/instructor-assignment-widget"
import { LeadStatusBadge } from "@/components/status-badge"
import { CollectParticipantsDialog } from "@/components/leads/collect-participants-dialog"
import { ExternalParticipantDialog } from "@/components/leads/external-participant-dialog"
import { LeadPaymentDialog } from "@/components/leads/lead-payment-dialog"
import { LifecycleControls } from "@/components/leads/lifecycle-controls"
import { ExpensesSection } from "@/components/leads/expenses-section"
import { ParticipantsSection } from "@/components/leads/participants-section"
import { TextImportModal } from "@/components/leads/text-import-modal"
import { TrainingSalesSection } from "@/components/leads/training-sales-section"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  formatLeadCourseType,
} from "@/lib/course-type"
import { exportLeadCertificatesToSheetsAction } from "@/lib/actions"
import {
  formatCurrency,
  formatDate,
  formatDateWithWeekday,
  formatLeadCategory,
  downloadLeadIcs,
  weekdayNameHe,
  whatsappLink,
} from "@/lib/helpers"
import { leadCalendarSessions, sessionLocationLabel } from "@/lib/payment"
import { isInstructorUnassigned, isOwnerInstructor, shouldShowUnassignedInstructorWarning } from "@/lib/instructor"
import { useApp } from "@/lib/store"
import { computeTrainingProfit, computeTrainingPaymentSummary } from "@/lib/training-profit"
import type { TraineeImportRow } from "@/lib/trainee-import"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Lead } from "@/lib/types"

const DETAIL_TABS = ["home", "participants", "finance"] as const
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
  const [collectOpen, setCollectOpen] = useState(false)
  const [manualParticipantOpen, setManualParticipantOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>("home")
  const [excelImportOpen, setExcelImportOpen] = useState(false)
  const [textImportOpen, setTextImportOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState<TraineeImportRow[] | null>(
    null,
  )

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

  const courseLabel = formatLeadCourseType(lead, settings.courses)
  const payments = computeTrainingPaymentSummary(lead)

  const sessions = leadCalendarSessions(lead)
  const physical = sessions.find((s) => !s.isZoom)
  const allZoom = sessions.length > 0 && sessions.every((s) => s.isZoom)
  const addressLine = allZoom
    ? "זום"
    : sessionLocationLabel(
        physical || {
          city: lead.address.city,
          street: lead.address.street,
          houseNumber: lead.address.houseNumber,
        },
      )

  const zoomInvite = sessions.find((s) => s.zoomLink?.trim())
  const zoomLink = zoomInvite?.zoomLink?.trim() || ""
  const primarySession = sessions[0]
  const sessionDate = primarySession?.date || lead.date
  const sessionTime = primarySession?.time || lead.time
  const sessionIsZoom = Boolean(primarySession?.isZoom) || allZoom
  const locationText = sessionIsZoom
    ? "בזום"
    : sessionLocationLabel(
        primarySession || {
          city: lead.address.city,
          street: lead.address.street,
          houseNumber: lead.address.houseNumber,
        },
      )
  const trainingDetailsWhatsApp = [
    "פרטי הדרכה:",
    sessionDate ? formatDate(sessionDate) : "",
    sessionDate ? weekdayNameHe(sessionDate) : "",
    sessionTime ? `ב${sessionTime}` : "",
    locationText || "",
  ]
    .filter((line) => line !== "")
    .join("\n")
  const wazeUrl =
    addressLine && addressLine !== "זום"
      ? `https://waze.com/ul?q=${encodeURIComponent(addressLine)}&navigate=yes`
      : null

  const syncCalendar = () => {
    if (!sessions.length && (!lead.date || !lead.time)) {
      toast.error("יש להגדיר תאריך ושעה לפני הוספה ליומן")
      return
    }
    downloadLeadIcs(lead)
    toast.success(
      sessions.length > 1
        ? `קובץ היומן כולל ${sessions.length} מפגשים — שמרו ביומן`
        : "קובץ היומן נפתח — שמרו את האירוע ביומן",
    )
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
          <header className="border-b border-slate-200/80 bg-slate-50/90 px-5 py-4 shadow-sm backdrop-blur-md md:px-6 md:py-5 lg:px-5 lg:py-2.5">
            {embedded && (
              <Link
                href="/leads"
                className="mb-3 hidden w-fit items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary md:inline-flex lg:mb-1.5 lg:px-3 lg:py-1.5 lg:text-xs"
              >
                <ArrowRight className="size-4 shrink-0" />
                חזרה לכלל הלידים וההדרכות
              </Link>
            )}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
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
                    className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-secondary-foreground shadow-sm lg:mt-0 lg:size-9"
                  >
                    <ArrowRight className="size-5 lg:size-4" />
                  </button>
                )}

                <div className="min-w-0 flex-1 space-y-1.5 lg:space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2.5 lg:gap-2">
                    <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl lg:text-lg">
                      {lead.name}
                    </h1>
                    <LeadStatusBadge
                      status={lead.status}
                      className="px-3.5 py-1.5 text-sm font-bold shadow-sm lg:px-2.5 lg:py-0.5 lg:text-xs"
                    />
                  </div>
                  <p className="truncate text-sm font-medium text-muted-foreground md:text-base lg:text-xs">
                    {courseLabel}
                  </p>
                  <div className="max-w-xs pt-1 lg:max-w-sm lg:pt-0">
                    <InstructorAssignmentWidget lead={lead} compact />
                  </div>
                  <p className="text-base font-extrabold text-foreground md:text-lg lg:text-sm">
                    הסכום הכולל של ההדרכה:{" "}
                    <span className="text-primary">
                      {formatCurrency(payments.expectedTotal)}
                    </span>
                  </p>
                  {payments.leadOptionAmount > 0 ? (
                    <p className="text-xs font-normal text-muted-foreground lg:text-[11px]">
                      {payments.leadOptionCount > 1
                        ? `* עוד כ-${formatCurrency(payments.leadOptionAmount)} באופציה (${payments.leadOptionCount} לידים)`
                        : `* ${formatCurrency(payments.leadOptionAmount)} באופציה`}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 md:gap-4 lg:shrink-0 lg:gap-1.5">
                <IconAction
                  href={`tel:${lead.phone}`}
                  label="חיוג"
                  className="bg-white/80 text-primary shadow-sm lg:size-9 lg:p-2"
                >
                  <Phone className="size-6 lg:size-4" />
                </IconAction>
                <IconAction
                  href={whatsappLink("", trainingDetailsWhatsApp)}
                  label="שליחת פרטי הדרכה"
                  external
                  className="bg-white/80 text-primary shadow-sm lg:size-9 lg:p-2"
                >
                  <Send className="size-6 lg:size-4" />
                </IconAction>
                <IconAction
                  href={whatsappLink(lead.phone)}
                  label="וואטסאפ"
                  external
                  className="bg-white/80 shadow-sm lg:size-9 lg:p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/whatsapp.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="size-6 lg:size-4"
                  />
                </IconAction>
                <button
                  type="button"
                  onClick={() => setPaymentOpen(true)}
                  aria-label="רישום תשלום"
                  className="flex size-12 items-center justify-center rounded-full bg-white/80 p-3 text-foreground shadow-sm active:scale-95 transition-transform lg:size-9 lg:p-2"
                >
                  <CreditCard className="size-6 lg:size-4" />
                </button>
                <button
                  type="button"
                  onClick={syncCalendar}
                  aria-label="הכנס ללו״ז"
                  className="flex size-12 items-center justify-center rounded-full bg-white/80 p-3 text-foreground shadow-sm active:scale-95 transition-transform lg:size-9 lg:p-2"
                >
                  <CalendarPlus className="size-6 lg:size-4" />
                </button>
                <Link
                  href={`/leads/${lead.id}/edit`}
                  aria-label="עריכה"
                  className="flex size-12 items-center justify-center rounded-full bg-white/80 p-3 text-foreground shadow-sm active:scale-95 transition-transform lg:size-9 lg:p-2"
                >
                  <Pencil className="size-6 lg:size-4" />
                </Link>
                {zoomLink ? (
                  <IconAction
                    href={zoomLink}
                    label="זום"
                    external
                    className="bg-sky-50 text-sky-700 shadow-sm lg:size-9 lg:p-2"
                  >
                    <Video className="size-6 lg:size-4" />
                  </IconAction>
                ) : null}
              </div>
            </div>
          </header>

          {/* —— Tab bar (click/tap only — no swipe) —— */}
          <TabsList
            variant="line"
            className="h-auto min-h-[48px] w-full justify-stretch gap-0 rounded-none border-b border-slate-200 bg-card p-0"
          >
            <TopTab value="home" icon={LayoutDashboard} label="ראשי" />
            <TopTab value="participants" icon={Users} label="משתתפים" />
            <TopTab value="finance" icon={Wallet} label="כספים ומכירות" />
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="home" className="m-0 space-y-4 p-4 md:p-6">
            <HomeTab
              lead={lead}
              addressLine={addressLine}
              wazeUrl={wazeUrl}
            />
          </TabsContent>

          <TabsContent value="participants" className="m-0 space-y-4 p-4 md:p-6">
            <ParticipantsTab
              lead={lead}
              active={detailTab === "participants"}
              onCollect={() => setCollectOpen(true)}
              onExcelImport={() => {
                setPreviewRows(null)
                setExcelImportOpen(true)
              }}
              onTextImport={() => setTextImportOpen(true)}
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
        onManualParticipant={() => setManualParticipantOpen(true)}
        onExcelImport={() => {
          setPreviewRows(null)
          setExcelImportOpen(true)
        }}
        onTextImport={() => setTextImportOpen(true)}
      />
      <ExternalParticipantDialog
        open={manualParticipantOpen}
        onOpenChange={setManualParticipantOpen}
        defaultLeadId={lead.id}
        lockLead
        title="הוספת משתתף ידני"
        defaultIsExternal={false}
      />
      <LeadPaymentDialog
        lead={lead}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
      <TraineeImportDialog
        open={excelImportOpen}
        onOpenChange={setExcelImportOpen}
        lockedLeadId={lead.id}
        title="ייבוא משתתפים מאקסל"
        confirmLabel="אשר וייבא משתתפים"
      />
      <TextImportModal
        open={textImportOpen}
        onOpenChange={setTextImportOpen}
        leadId={lead.id}
        onParsed={(rows) => {
          setPreviewRows(rows)
          setPreviewOpen(true)
        }}
      />
      <TraineeImportDialog
        open={previewOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o)
          if (!o) setPreviewRows(null)
        }}
        lockedLeadId={lead.id}
        initialRows={previewRows}
        hideFilePicker
        title="תצוגה מקדימה — ייבוא מטקסט"
        confirmLabel="אשר וייבא משתתפים"
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
      className={cn(
        "flex min-h-[48px] flex-1 flex-col gap-0.5 rounded-none border-0 border-b-2 border-transparent",
        "bg-transparent px-3 py-3.5 text-[10px] font-medium leading-tight text-slate-500",
        "shadow-none transition-colors hover:bg-slate-50 hover:text-slate-700",
        "data-active:bg-blue-50/70 data-active:font-semibold data-active:text-blue-900",
        "data-active:border-b-2 data-active:border-blue-600 data-active:shadow-none",
        "after:hidden sm:text-[11px]",
      )}
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
}: {
  lead: Lead
  addressLine: string
  wazeUrl: string | null
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
              shouldShowUnassignedInstructorWarning(lead)
                ? "לא שובץ מדריך"
                : isInstructorUnassigned(lead.instructor)
                  ? "—"
                  : lead.instructor || "—"
            }
            valueClassName={
              shouldShowUnassignedInstructorWarning(lead)
                ? "font-bold text-red-600"
                : undefined
            }
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
            label="קטגוריה"
            value={formatLeadCategory(lead.category)}
          />
        </div>

        <div className="flex items-start gap-3 rounded-2xl bg-secondary/50 p-3">
          {addressLine === "זום" ? (
            <Video className="mt-0.5 size-5 shrink-0 text-sky-700" />
          ) : (
            <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {addressLine === "זום" ? "מפגש בזום" : "כתובת"}
            </p>
            <p className="text-sm font-medium leading-snug">
              {addressLine || "לא הוגדרה כתובת"}
            </p>
            {lead.sessions
              ?.filter((s) => s.isZoom || s.zoomLink?.trim())
              .map((s, idx) => {
                const href = s.zoomLink?.trim()
                return (
                  <p key={`${s.date}-${s.time}-${idx}`} className="mt-1 text-xs">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-medium text-sky-700 underline"
                        dir="ltr"
                      >
                        {href}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">חסר קישור זום</span>
                    )}
                  </p>
                )
              })}
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

        {lead.notes ? (
          <p className="rounded-2xl bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground">
            {lead.notes}
          </p>
        ) : null}
      </Card>

      <LifecycleControls lead={lead} hideParticipantsManage />
    </>
  )
}

function ParticipantsTab({
  lead,
  active,
  onCollect,
  onExcelImport,
  onTextImport,
}: {
  lead: Lead
  active: boolean
  onCollect: () => void
  onExcelImport: () => void
  onTextImport: () => void
}) {
  const [exporting, setExporting] = useState(false)

  const exportToSheets = async () => {
    setExporting(true)
    const res = await exportLeadCertificatesToSheetsAction(lead.id)
    setExporting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const parts: string[] = []
    if (res.data.exported > 0) {
      parts.push(`יוצאו ${res.data.exported} נוכחים`)
    }
    if (res.data.attendanceUpdated > 0) {
      parts.push(`עודכנה נוכחות ל-${res.data.attendanceUpdated}`)
    }
    toast.success(
      parts.length ? parts.join(" · ") : "אין משתתפים חדשים לייצוא",
    )
  }

  return (
    <>
      <Card className="gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold">כלי רישום משתתפים</h2>
            <p className="text-xs text-muted-foreground">
              QR, ייבוא מאקסל / טקסט, והוספת משתתף ידני
            </p>
          </div>
          {(lead.status === "pending_certificates" ||
            lead.status === "completed" ||
            lead.status === "closed") && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-10 shrink-0 rounded-xl"
              disabled={exporting}
              onClick={() => void exportToSheets()}
              aria-label="ייצוא תעודות לאקסל"
              title="ייצוא תעודות לאקסל"
            >
              <FileSpreadsheet className="size-4" />
            </Button>
          )}
        </div>
        <Button
          className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
          onClick={onCollect}
        >
          <UserPlus className="size-5" />
          פתח אפשרויות רישום
        </Button>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 rounded-xl"
            onClick={onCollect}
          >
            <UserPlus className="size-4" />
            הוסף משתתף
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 rounded-xl"
            onClick={onExcelImport}
          >
            <Upload className="size-4" />
            ייבוא מאקסל
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 rounded-xl"
            onClick={onTextImport}
          >
            <ClipboardPaste className="size-4" />
            ייבוא מטקסט חופשי
          </Button>
        </div>
      </Card>

      <ParticipantsSection lead={lead} active={active} />
    </>
  )
}

function FinanceTab({ lead }: { lead: Lead }) {
  const { instructors } = useApp()
  const profit = computeTrainingProfit(lead, instructors)
  const payments = computeTrainingPaymentSummary(lead)

  return (
    <>
      <Card className="gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">סיכום תשלומים</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/60 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">צפוי</p>
            <p className="text-sm font-extrabold">
              {formatCurrency(payments.expectedTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-2 py-2">
            <p className="text-[10px] text-emerald-800">נגבה</p>
            <p className="text-sm font-extrabold text-emerald-800">
              {formatCurrency(payments.collectedTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 px-2 py-2">
            <p className="text-[10px] text-amber-900">יתרה</p>
            <p className="text-sm font-extrabold text-amber-900">
              {formatCurrency(payments.remaining)}
            </p>
          </div>
        </div>
        {payments.leadOptionAmount > 0 ? (
          <p className="text-center text-xs font-normal text-muted-foreground">
            {payments.leadOptionCount > 1
              ? `* עוד כ-${formatCurrency(payments.leadOptionAmount)} באופציה (${payments.leadOptionCount} לידים)`
              : `* ${formatCurrency(payments.leadOptionAmount)} באופציה`}
          </p>
        ) : null}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>התקדמות גבייה</span>
            <span className="font-semibold">{payments.progressPct}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width]"
              style={{ width: `${payments.progressPct}%` }}
            />
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">תשלום הדרכה (בסיס)</span>
            <span className="font-semibold">
              {formatCurrency(payments.baseCoveredAmount)} /{" "}
              {formatCurrency(payments.basePrice)}
              {payments.baseSettled ? (
                <span className="mr-1 text-emerald-700"> · כוסה</span>
              ) : (
                <span className="mr-1 text-amber-800"> · ממתין</span>
              )}
            </span>
          </li>
          {payments.externals.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {p.name} · חיצוני
              </span>
              <span className="shrink-0 font-semibold">
                {formatCurrency(p.paid ? p.amount : 0)} /{" "}
                {formatCurrency(p.amount)}
                {p.paid ? (
                  <span className="mr-1 text-emerald-700"> · שולם</span>
                ) : (
                  <span className="mr-1 text-amber-800"> · ממתין</span>
                )}
              </span>
            </li>
          ))}
          {payments.internals.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {p.name} · תשלום אישי
              </span>
              <span className="shrink-0 font-semibold">
                {formatCurrency(p.amount)}
                <span className="mr-1 text-emerald-700"> · נגבה</span>
              </span>
            </li>
          ))}
          {payments.sales.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {s.name} · מכירת ציוד
              </span>
              <span className="shrink-0 font-semibold">
                {formatCurrency(s.paid ? s.amount : 0)} /{" "}
                {formatCurrency(s.amount)}
                {s.paid ? (
                  <span className="mr-1 text-emerald-700"> · שולם</span>
                ) : (
                  <span className="mr-1 text-amber-800"> · ממתין</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

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
          {!isOwnerInstructor(lead.instructor) && (
            <Info
              label="עלות מדריך"
              value={formatCurrency(profit.instructorFee)}
            />
          )}
          <Info
            label="עלות ציוד"
            value={formatCurrency(profit.salesCost)}
          />
          <Info
            label="הוצאות אחרות"
            value={formatCurrency(profit.otherExpenses)}
          />
          {profit.salesCommissions > 0 ? (
            <Info
              label="עמלות מכירה"
              value={formatCurrency(profit.salesCommissions)}
            />
          ) : null}
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
