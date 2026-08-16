"use client"

import { MapPin, User, Wallet } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Card } from "@/components/ui/card"
import { formatLeadCourseType } from "@/lib/course-type"
import {
  formatCurrency,
  formatDateWithWeekday,
  formatTrainingDuration,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import { resolveInstructorFee } from "@/lib/training-profit"

/** סקירת הדרכות שבוצעו ע״י מדריכים — למנהל תחת ״עוד״ */
export function InstructorsOverview() {
  const { leads, settings, instructors } = useApp()

  const completed = leads
    .filter((l) => l.status === "pending_certificates" && l.instructor?.trim())
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))

  const byInstructor = completed.reduce<Record<string, number>>((acc, l) => {
    const name = l.instructor!.trim()
    acc[name] = (acc[name] || 0) + resolveInstructorFee(l, instructors)
    return acc
  }, {})

  return (
    <div>
      <PageHeader
        title="הדרכות מדריכים"
        subtitle="הדרכות שבוצעו — סיכום לפי מדריך"
      />
      <div className="space-y-4 p-4">
        {Object.keys(byInstructor).length > 0 && (
          <Card className="space-y-2 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              סיכום שכר לפי מדריך
            </p>
            {Object.entries(byInstructor).map(([name, sum]) => (
              <div
                key={name}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium">{name}</span>
                <span className="font-bold text-primary">
                  {formatCurrency(sum)}
                </span>
              </div>
            ))}
          </Card>
        )}

        {completed.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            אין הדרכות שבוצעו עם מדריך משובץ
          </p>
        ) : (
          completed.map((lead) => {
            const address = [
              lead.address?.street,
              lead.address?.houseNumber,
            ]
              .filter(Boolean)
              .join(" ")
            return (
              <Card key={lead.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-right">
                    <p className="font-bold">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatLeadCourseType(lead, settings.courses)} ·{" "}
                      {formatDateWithWeekday(lead.date)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary">
                    {formatCurrency(resolveInstructorFee(lead, instructors))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Meta icon={User} label="מדריך" value={lead.instructor || "—"} />
                  <Meta
                    icon={Wallet}
                    label="משך"
                    value={formatTrainingDuration(lead)}
                  />
                  <Meta
                    icon={MapPin}
                    label="עיר"
                    value={lead.address?.city || "—"}
                  />
                  <Meta icon={MapPin} label="כתובת" value={address || "—"} />
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-secondary/40 p-2">
      <p className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
