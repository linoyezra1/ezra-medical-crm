"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowRight,
  BookOpen,
  Copy,
  GraduationCap,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Presentation,
  Send,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { LeadStatusBadge } from "@/components/status-badge"
import { AddTaskDialog } from "@/components/leads/add-task-dialog"
import { LifecycleControls } from "@/components/leads/lifecycle-controls"
import { ExpensesSection } from "@/components/leads/expenses-section"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  findCourseCatalog,
  formatLeadCourseType,
} from "@/lib/course-type"
import {
  formatCurrency,
  formatDate,
  whatsappLink,
  whatsappSummary,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

export function LeadDetailView({ leadId }: { leadId: string }) {
  const router = useRouter()
  const { getLead, settings, addTask } = useApp()
  const lead = getLead(leadId)
  const [lmsOpen, setLmsOpen] = useState(false)

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

  const sendBooklet = () => {
    const url = course?.bookletUrl
    if (!url) {
      toast.error("לא הוגדרה חוברת לסוג הקורס של ליד זה. הגדר בהגדרות → תוכן קורסים")
      return
    }
    const text = `שלום ${lead.contactName || lead.name},\nמצורפת חוברת הקורס (${courseLabel}):\n${url}`
    window.open(whatsappLink(lead.phone, text), "_blank")
  }

  const openLms = () => {
    const username = lead.email?.split("@")[0] || lead.phone
    toast.success(
      `נוצר משתמש LMS: ${username} · סיסמה זמנית: Temp${Math.floor(1000 + Math.random() * 9000)}`,
    )
    setLmsOpen(true)
  }

  return (
    <div>
      <PageHeader
        title={lead.name}
        subtitle={courseLabel}
        back={
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="חזרה"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <ArrowRight className="size-5" />
          </button>
        }
        action={
          <Button
            size="icon"
            variant="secondary"
            nativeButton={false}
            className="size-9 rounded-full shrink-0"
            render={
              <Link href={`/leads/${lead.id}/edit`} aria-label="עריכה">
                <Pencil className="size-4" />
              </Link>
            }
          />
        }
      />

      <div className="space-y-4 p-4">
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
            <Info label="תאריך" value={`${formatDate(lead.date)}${lead.time ? ` · ${lead.time}` : ""}`} />
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
            href={whatsappLink(lead.phone, summaryText())}
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
        </div>

        <LifecycleControls lead={lead} />

        <Card className="gap-3 p-4">
          <h2 className="text-sm font-bold">שליחת חומרים ללקוח</h2>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              icon={BookOpen}
              label="שלח חוברת"
              onClick={sendBooklet}
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
        </Card>

        <ExpensesSection lead={lead} />

        <SmartBeeQuoteCard lead={lead} />
      </div>
    </div>
  )
}

function SmartBeeQuoteCard({ lead }: { lead: Lead }) {
  const { updateLead, addTask } = useApp()
  const [reminderOpen, setReminderOpen] = useState(false)
  const sent = !!lead.quoteSentAt

  return (
    <Card className="gap-3 p-4">
      <div>
        <p className="text-sm font-semibold">הצעת מחיר · SmartBee</p>
        <p className="text-xs text-muted-foreground">
          {sent
            ? `סומן כנשלח ב-${formatDate(lead.quoteSentAt)}`
            : "טרם סומן כנשלח ב-SmartBee"}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant={sent ? "secondary" : "default"}
          className="h-auto whitespace-normal py-3 text-right text-sm leading-snug"
          disabled={sent}
          onClick={() => {
            updateLead(lead.id, { quoteSentAt: new Date().toISOString() })
            toast.success("סומן שנשלחה הצעת מחיר ב-SmartBee")
          }}
        >
          {sent
            ? "✓ נשלחה הצעת מחיר ב-SmartBee"
            : "סמן שנשלחה הצעת מחיר ב-SmartBee"}
        </Button>
        <Button
          variant="outline"
          className="h-auto whitespace-normal py-3 text-right text-sm leading-snug"
          onClick={() => setReminderOpen(true)}
        >
          הוסף תזכורת לשלוח הצעת מחיר ב-SmartBee
        </Button>
      </div>
      <AddTaskDialog
        leadId={lead.id}
        leadName={lead.name}
        onAdd={addTask}
        hideTrigger
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        defaultTitle={`לשלוח הצעת מחיר ב-SmartBee ל${lead.name}`}
      />
    </Card>
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
