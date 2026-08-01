"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowRight,
  BookOpen,
  Copy,
  FileText,
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
import { LifecycleControls } from "@/components/leads/lifecycle-controls"
import { ExpensesSection } from "@/components/leads/expenses-section"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  formatCurrency,
  formatDate,
  whatsappLink,
  whatsappSummary,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"

export function LeadDetailView({ leadId }: { leadId: string }) {
  const router = useRouter()
  const { getLead, settings } = useApp()
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

  const course = settings.courses.find((c) => c.type === lead.courseType)

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(whatsappSummary(lead))
      toast.success("סיכום ההדרכה הועתק")
    } catch {
      toast.error("לא ניתן להעתיק")
    }
  }

  const sendFile = (label: string, url?: string) => {
    if (!url) {
      toast.error(`לא הוגדר ${label} לקורס זה`)
      return
    }
    const text = `${label} - ${lead.courseType}\n${url}`
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
        subtitle={lead.courseType}
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
        {/* כרטיס עליון */}
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

        {/* פעולות מהירות */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-95 transition-transform"
          >
            <Phone className="size-4" /> חיוג מהיר
          </a>
          <a
            href={whatsappLink(lead.phone, whatsappSummary(lead))}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-success py-3 text-sm font-semibold text-success-foreground active:scale-95 transition-transform"
          >
            <MessageCircle className="size-4" /> וואטסאפ
          </a>
        </div>

        {/* ניהול סטטוס / מחזור חיים */}
        <LifecycleControls lead={lead} />

        {/* סרגל פעולות הדרכה */}
        <Card className="gap-3 p-4">
          <h2 className="text-sm font-bold">שליחת חומרים ללקוח</h2>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              icon={BookOpen}
              label="חוברת הדרכה"
              onClick={() => sendFile("חוברת הדרכה", course?.bookletUrl)}
            />
            <ActionButton
              icon={Presentation}
              label="קישור מצגת"
              onClick={() => sendFile("מצגת", course?.presentationUrl)}
            />
            <ActionButton
              icon={FileText}
              label="סילבוס"
              onClick={() => sendFile("סילבוס", course?.syllabusUrl)}
            />
            <ActionButton icon={Copy} label="העתק סיכום" onClick={copySummary} />
            <ActionButton
              icon={Send}
              label="סיכום ללקוח"
              onClick={() =>
                window.open(
                  whatsappLink(lead.phone, whatsappSummary(lead)),
                  "_blank",
                )
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

        {/* הוצאות */}
        <ExpensesSection lead={lead} />

        {/* הצעת מחיר */}
        <Card className="flex-row items-center justify-between p-4">
          <div>
            <p className="text-sm font-semibold">הצעת מחיר</p>
            <p className="text-xs text-muted-foreground">
              {lead.quoteSentAt
                ? `נשלחה ב-${formatDate(lead.quoteSentAt)}`
                : "טרם נשלחה"}
            </p>
          </div>
          <QuoteButton leadId={lead.id} sent={!!lead.quoteSentAt} />
        </Card>
      </div>
    </div>
  )
}

function QuoteButton({ leadId, sent }: { leadId: string; sent: boolean }) {
  const { updateLead } = useApp()
  return (
    <Button
      variant={sent ? "secondary" : "default"}
      size="sm"
      onClick={() => {
        updateLead(leadId, { quoteSentAt: new Date().toISOString() })
        toast.success("סומן כנשלחה הצעה")
      }}
    >
      {sent ? "שלח שוב" : "סמן כנשלחה"}
    </Button>
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
