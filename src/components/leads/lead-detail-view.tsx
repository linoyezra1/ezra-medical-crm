"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Presentation,
  Printer,
  Send,
  UserPlus,
  CalendarPlus,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { LeadStatusBadge } from "@/components/status-badge"
import { AddTaskDialog } from "@/components/leads/add-task-dialog"
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
  whatsappLink,
  whatsappSummary,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const DETAIL_TABS = ["materials", "participants", "sales", "expenses"] as const
type DetailTab = (typeof DETAIL_TABS)[number]

export function LeadDetailView({
  leadId,
  embedded = false,
}: {
  leadId: string
  /** בתצוגת פיצול דסקטופ — בלי כפתור חזרה למובייל */
  embedded?: boolean
}) {
  const router = useRouter()
  const { getLead, settings, addTask } = useApp()
  const lead = getLead(leadId)
  const [lmsOpen, setLmsOpen] = useState(false)
  const [bookletOpen, setBookletOpen] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>("materials")
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

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 56) return
    const idx = DETAIL_TABS.indexOf(detailTab)
    // RTL: החלקה ימינה → טאב קודם, שמאלה → הבא
    if (dx > 0 && idx > 0) setDetailTab(DETAIL_TABS[idx - 1])
    else if (dx < 0 && idx < DETAIL_TABS.length - 1)
      setDetailTab(DETAIL_TABS[idx + 1])
  }

  return (
    <div className={embedded ? "md:min-h-full" : undefined}>
      <PageHeader
        title={lead.name}
        subtitle={courseLabel}
        back={
          embedded ? (
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
          )
        }
        action={
          <Button
            size="icon"
            variant="secondary"
            nativeButton={false}
            className="size-9 shrink-0 rounded-full"
            render={
              <Link href={`/leads/${lead.id}/edit`} aria-label="עריכה">
                <Pencil className="size-4" />
              </Link>
            }
          />
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="space-y-4">
        <Card className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <LeadStatusBadge status={lead.status} />
            {lead.trainingIndex && (
              <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                <GraduationCap className="size-3.5" />
                הדרכה מס' {lead.trainingIndex}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info
              label="תאריך"
              value={`${formatDateWithWeekday(lead.date)}${
                lead.time
                  ? ` · ${lead.time}${lead.endTime ? `–${lead.endTime}` : ""}`
                  : ""
              }`}
            />
            <Info label="מחיר כולל" value={formatCurrency(lead.totalPrice)} strong />
            <Info label="מדריך" value={lead.instructor || "-"} />
            <Info label="משתתפים" value={String(lead.participantsCount)} />
          </div>
          <div className="flex items-start gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {lead.address.street} {lead.address.houseNumber}, {lead.address.city}
            {lead.address.zip ? ` (${lead.address.zip})` : ""}
          </div>
          {lead.notes && (
            <p className="rounded-xl bg-secondary/50 p-2.5 text-xs text-muted-foreground">
              {lead.notes}
            </p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-95 transition-transform"
          >
            <Phone className="size-4" /> חיוג מהיר
          </a>
          <a
            href={whatsappLink(lead.phone)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-success py-3 text-sm font-semibold text-success-foreground active:scale-95 transition-transform"
          >
            <MessageCircle className="size-4" /> וואטסאפ
          </a>
          <AddTaskDialog
            leadId={lead.id}
            leadName={lead.name}
            onAdd={addTask}
            triggerClassName="col-span-2 rounded-2xl py-6"
          />
          <Button
            type="button"
            variant="outline"
            className="col-span-2 h-12 gap-2 rounded-2xl"
            onClick={() => {
              if (!lead.date || !lead.time) {
                toast.error("יש להגדיר תאריך ושעה לפני הוספה ליומן")
                return
              }
              downloadLeadIcs(lead)
              toast.success("קובץ היומן נפתח — שמרו את האירוע ביומן")
            }}
          >
            <CalendarPlus className="size-4" />
            הכנס ללו״ז
          </Button>
        </div>

        <LifecycleControls lead={lead} />

        {canCollectParticipants && (
          <>
            <Button
              className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
              onClick={() => setCollectOpen(true)}
            >
              <UserPlus className="size-5" />
              הוסף משתתפים
            </Button>
            <CollectParticipantsDialog
              lead={lead}
              open={collectOpen}
              onOpenChange={setCollectOpen}
            />
          </>
        )}
        </div>

        <Tabs
          value={detailTab}
          onValueChange={(v) => setDetailTab(v as DetailTab)}
          dir="rtl"
          className="w-full lg:sticky lg:top-[73px]"
        >
          <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
            <TabsTrigger value="materials" className="px-1 text-[10px] leading-tight">
              חומרי הדרכה
            </TabsTrigger>
            <TabsTrigger value="participants" className="px-1 text-[10px] leading-tight">
              משתתפים
            </TabsTrigger>
            <TabsTrigger value="sales" className="px-1 text-[10px] leading-tight">
              מכירות
            </TabsTrigger>
            <TabsTrigger value="expenses" className="px-1 text-[10px] leading-tight">
              הוצאות
            </TabsTrigger>
          </TabsList>

          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <TabsContent value="materials" className="mt-3">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3">
              <ActionButton
                icon={BookOpen}
                label="שלח חוברת"
                onClick={() => setBookletOpen(true)}
              />
              <ActionButton
                icon={Printer}
                label="חוברת להדפסה"
                onClick={() =>
                  sendStaticMaterial("booklet44WordPrint", "חוברת להדפסה (Word)")
                }
              />
              <ActionButton
                icon={FileText}
                label="מבחן גרסה 1"
                onClick={() => sendStaticMaterial("exam44v1", "מבחן 44 גרסה 1")}
              />
              <ActionButton
                icon={ClipboardList}
                label="מבחן גרסה 2"
                onClick={() => sendStaticMaterial("exam44v2", "מבחן 44 גרסה 2")}
              />
              <ActionButton
                icon={FileSpreadsheet}
                label="טבלת משתתפים"
                onClick={() =>
                  sendStaticMaterial("participantsTable", "פורמט טבלת משתתפים")
                }
              />
              <ActionButton
                icon={Presentation}
                label="קישור מצגת"
                onClick={() => sendFile("מצגת", course?.presentationUrl)}
              />
              <ActionButton icon={Copy} label="העתק סיכום" onClick={copySummary} />
              <ActionButton
                icon={Send}
                label="סיכום שיחה"
                onClick={() =>
                  window.open(whatsappLink(lead.phone, summaryText()), "_blank")
                }
              />
              <ActionButton
                icon={UserPlus}
                label="פתח משתמש LMS"
                onClick={openLms}
                highlight={lmsOpen}
              />
            </div>
          </TabsContent>

          <TabsContent value="participants" className="mt-3">
            <ParticipantsSection lead={lead} />
          </TabsContent>

          <TabsContent value="sales" className="mt-3">
            <TrainingSalesSection lead={lead} />
          </TabsContent>

          <TabsContent value="expenses" className="mt-3">
            <ExpensesSection lead={lead} />
          </TabsContent>
          </div>
        </Tabs>
        </div>

        <SendBookletDialog
          lead={lead}
          open={bookletOpen}
          onOpenChange={setBookletOpen}
        />
      </div>
    </div>
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
      className={
        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium active:scale-95 transition-transform " +
        (highlight
          ? "border-success bg-success/10 text-success"
          : "border-border bg-secondary/40 text-foreground")
      }
    >
      <Icon className="size-5 text-primary" />
      {label}
    </button>
  )
}
