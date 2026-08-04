"use client"

import { useRouter } from "next/navigation"
import { MapPin, MessageCircle, Phone } from "lucide-react"
import { LeadStatusBadge } from "@/components/status-badge"
import { Card } from "@/components/ui/card"
import {
  findCourseCatalog,
  formatLeadCourseType,
} from "@/lib/course-type"
import {
  formatCurrency,
  formatDateWithWeekday,
  whatsappLink,
  whatsappSummary,
  leadStatusCardClass,
} from "@/lib/helpers"
import { isInstructorUnassigned } from "@/lib/instructor"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

export function LeadCard({ lead }: { lead: Lead }) {
  const router = useRouter()
  const { settings } = useApp()
  const course = findCourseCatalog(lead.courseType, settings.courses)
  const courseLabel = formatLeadCourseType(lead, settings.courses)
  const stop = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const go = () => router.push(`/leads/${lead.id}`)

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          go()
        }
      }}
      className="block cursor-pointer"
    >
      <Card
        className={cn(
          "gap-3 border-2 p-4 active:scale-[0.99] transition-transform",
          leadStatusCardClass(lead.status),
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold text-foreground">{lead.name}</h3>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {courseLabel}
              {lead.customerType === "existing" && (
                <span className="mr-1 text-primary"> · לקוח קיים</span>
              )}
            </p>
          </div>
          <LeadStatusBadge status={lead.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" />
            {lead.address.city || "ללא כתובת"}
          </span>
          {lead.date && (
            <span>
              {formatDateWithWeekday(lead.date)}
              {lead.time ? ` · ${lead.time}` : ""}
              {lead.endTime ? `–${lead.endTime}` : ""}
            </span>
          )}
          <span className="font-semibold text-foreground">
            {formatCurrency(lead.totalPrice)}
          </span>
          {isInstructorUnassigned(lead.instructor) ? (
            <span className="font-bold text-red-600">לא שובץ מדריך</span>
          ) : (
            <span className="font-medium text-foreground">
              {lead.instructor}
            </span>
          )}
        </div>

        {(lead.createdBy || lead.lastUpdatedBy) && (
          <p className="text-[11px] text-muted-foreground">
            {lead.createdBy ? `נוצר על ידי: ${lead.createdBy}` : null}
            {lead.createdBy && lead.lastUpdatedBy ? " · " : null}
            {lead.lastUpdatedBy
              ? `עודכן: ${lead.lastUpdatedBy}`
              : null}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <a
            href={`tel:${lead.phone}`}
            onClick={stop}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground active:scale-95 transition-transform"
          >
            <Phone className="size-4" /> חיוג
          </a>
          <a
            href={whatsappLink(lead.phone, whatsappSummary(lead, course))}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success/10 py-2 text-xs font-semibold text-success active:scale-95 transition-transform"
          >
            <MessageCircle className="size-4" /> סיכום שיחה
          </a>
        </div>
      </Card>
    </div>
  )
}
