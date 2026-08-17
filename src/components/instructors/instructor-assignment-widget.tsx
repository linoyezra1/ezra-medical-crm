"use client"

import { useEffect, useState } from "react"
import { Loader2, UserRound } from "lucide-react"
import { toast } from "sonner"
import {
  InstructorSelectField,
  initialInstructorAssignValue,
  resolvedInstructorName,
  type InstructorAssignValue,
} from "@/components/instructors/instructor-select-field"
import { Label } from "@/components/ui/label"
import { ensureInstructor } from "@/lib/actions"
import {
  isInstructorUnassigned,
  isOwnerInstructor,
  UNASSIGNED_INSTRUCTOR,
} from "@/lib/instructor"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

export function InstructorAssignmentWidget({
  lead,
  compact = false,
}: {
  lead: Lead
  compact?: boolean
}) {
  const { instructors, updateLead, refresh } = useApp()
  const [value, setValue] = useState<InstructorAssignValue>(() =>
    initialInstructorAssignValue(lead, instructors),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(initialInstructorAssignValue(lead, instructors))
  }, [lead.id, lead.instructor, lead.instructorId, instructors])

  const persist = async (next: InstructorAssignValue) => {
    setValue(next)
    const name = resolvedInstructorName(next)
    const unassigned = isInstructorUnassigned(name)

    setSaving(true)
    try {
      let instructorName = name
      let instructorId: string | undefined

      if (unassigned) {
        instructorName = UNASSIGNED_INSTRUCTOR
        instructorId = undefined
      } else if (isOwnerInstructor(name)) {
        instructorId = next.instructorId
      } else {
        const fee = Number(next.fee) || 0
        const ensured = await ensureInstructor(name, fee)
        if (!ensured.ok) {
          toast.error(ensured.error)
          setValue(initialInstructorAssignValue(lead, instructors))
          return
        }
        instructorName = ensured.data.name
        instructorId = ensured.data.id
      }

      const ok = await updateLead(lead.id, {
        instructor: instructorName,
        instructorId,
        instructorFeeOverride: undefined,
      })
      if (ok) {
        toast.success(unassigned ? "שיבוץ המדריך הוסר" : `שובץ ${instructorName}`)
        refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <Label
        className={
          compact
            ? "flex items-center gap-1.5 text-xs text-muted-foreground"
            : "text-sm font-medium"
        }
      >
        <UserRound className="size-3.5" />
        מדריך
        {saving && <Loader2 className="size-3 animate-spin text-primary" />}
      </Label>
      <InstructorSelectField
        value={value}
        onChange={(next) => void persist(next)}
        triggerClassName={compact ? "h-10 bg-white" : undefined}
      />
    </div>
  )
}
