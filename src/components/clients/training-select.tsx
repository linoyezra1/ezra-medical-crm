"use client"

import { useMemo } from "react"
import { formatLeadCourseType } from "@/lib/course-type"
import { formatDate } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import { ASSIGNABLE_LEAD_STATUSES } from "@/lib/trainee-import"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

export function useAssignableTrainings() {
  const { leads, settings } = useApp()

  return useMemo(() => {
    return leads
      .filter((l) =>
        (ASSIGNABLE_LEAD_STATUSES as readonly string[]).includes(l.status),
      )
      .sort((a, b) => {
        const da = a.date || ""
        const db = b.date || ""
        return db.localeCompare(da)
      })
      .map((l) => ({
        lead: l,
        label: formatTrainingOptionLabel(l, settings.courses),
      }))
  }, [leads, settings.courses])
}

export function formatTrainingOptionLabel(
  lead: Lead,
  courses: Parameters<typeof formatLeadCourseType>[1],
): string {
  const name = lead.name
  const course = formatLeadCourseType(lead, courses)
  const date = lead.date ? formatDate(lead.date) : "ללא תאריך"
  const city = lead.address?.city || "—"
  return `${name} | ${course} | ${date} | ${city}`
}

export function TrainingSelect({
  value,
  onChange,
  optional,
  className,
  id,
}: {
  value: string
  onChange: (leadId: string) => void
  optional?: boolean
  className?: string
  id?: string
}) {
  const options = useAssignableTrainings()

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <option value="">
        {optional ? "ללא שיוך (אופציונלי)" : "בחרו הדרכה…"}
      </option>
      {options.map(({ lead, label }) => (
        <option key={lead.id} value={lead.id}>
          {label}
        </option>
      ))}
    </select>
  )
}
