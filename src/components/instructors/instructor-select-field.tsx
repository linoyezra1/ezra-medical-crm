"use client"

import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { QuickAddInstructorModal } from "@/components/instructors/quick-add-instructor-modal"
import {
  ADD_INSTRUCTOR_LABEL,
  ADD_INSTRUCTOR_VALUE,
  buildInstructorSelectOptions,
  isInstructorUnassigned,
  isOwnerInstructor,
  UNASSIGNED_INSTRUCTOR,
  UNASSIGNED_INSTRUCTOR_VALUE,
} from "@/lib/instructor"
import { useApp } from "@/lib/store"
import type { InstructorProfile } from "@/lib/types"

export type InstructorAssignValue = {
  /** ערך ה-Select (שם מדריך או UNASSIGNED) */
  selectValue: string
  instructorId?: string
  instructorName: string
  fee: string
}

type Props = {
  value: InstructorAssignValue
  onChange: (next: InstructorAssignValue) => void
  error?: boolean
  className?: string
  triggerClassName?: string
}

export function InstructorSelectField({
  value,
  onChange,
  error,
  className,
  triggerClassName,
}: Props) {
  const { instructors, addInstructorLocal } = useApp()
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const options = useMemo(
    () => buildInstructorSelectOptions(instructors),
    [instructors],
  )

  const applySelection = (
    next: string,
    profile?: Pick<InstructorProfile, "id" | "name" | "fee">,
  ) => {
    if (
      next === UNASSIGNED_INSTRUCTOR_VALUE ||
      isInstructorUnassigned(next)
    ) {
      onChange({
        selectValue: UNASSIGNED_INSTRUCTOR_VALUE,
        instructorId: undefined,
        instructorName: UNASSIGNED_INSTRUCTOR,
        fee: "",
      })
      return
    }

    const name = profile?.name || next
    const dbProfile = profile || instructors.find((i) => i.name === name)

    onChange({
      selectValue: name,
      instructorId: dbProfile?.id,
      instructorName: name,
      fee:
        isOwnerInstructor(name)
          ? ""
          : dbProfile && dbProfile.fee > 0
            ? String(dbProfile.fee)
            : value.fee,
    })
  }

  const handleQuickCreated = (instructor: InstructorProfile) => {
    addInstructorLocal(instructor)
    applySelection(instructor.name, instructor)
  }

  return (
    <>
      <Select
        value={value.selectValue}
        onValueChange={(v) => {
          const next = v ?? UNASSIGNED_INSTRUCTOR_VALUE
          if (next === ADD_INSTRUCTOR_VALUE) {
            setQuickAddOpen(true)
            return
          }
          applySelection(next)
        }}
      >
        <SelectTrigger
          className={triggerClassName ?? `w-full ${className ?? ""}`}
          aria-invalid={error || undefined}
        >
          <SelectValue placeholder="בחר מדריך">
            {(selected: string | null) => {
              if (
                !selected ||
                selected === UNASSIGNED_INSTRUCTOR_VALUE ||
                isInstructorUnassigned(selected)
              ) {
                return UNASSIGNED_INSTRUCTOR
              }
              return selected
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          className="max-h-[min(320px,70vh)]"
        >
          <SelectItem
            value={UNASSIGNED_INSTRUCTOR_VALUE}
            className="font-semibold text-red-600 focus:text-red-700"
          >
            {UNASSIGNED_INSTRUCTOR}
          </SelectItem>
          <SelectSeparator />
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem
            value={ADD_INSTRUCTOR_VALUE}
            className="font-semibold text-primary"
          >
            {ADD_INSTRUCTOR_LABEL}
          </SelectItem>
        </SelectContent>
      </Select>

      <QuickAddInstructorModal
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onCreated={handleQuickCreated}
      />
    </>
  )
}

/** ערך התחלתי לשדה שיבוץ מדריך */
export function initialInstructorAssignValue(
  lead?: {
    instructor?: string
    instructorId?: string
    instructorFeeOverride?: number
  } | null,
  instructors: InstructorProfile[] = [],
): InstructorAssignValue {
  if (isInstructorUnassigned(lead?.instructor)) {
    return {
      selectValue: UNASSIGNED_INSTRUCTOR_VALUE,
      instructorName: UNASSIGNED_INSTRUCTOR,
      fee: "",
    }
  }

  const name = lead?.instructor?.trim()
  if (!name) {
    return {
      selectValue: UNASSIGNED_INSTRUCTOR_VALUE,
      instructorName: UNASSIGNED_INSTRUCTOR,
      fee: "",
    }
  }

  const profile =
    (lead?.instructorId
      ? instructors.find((i) => i.id === lead.instructorId)
      : undefined) || instructors.find((i) => i.name === name)

  const fee =
    isOwnerInstructor(name)
      ? ""
      : lead?.instructorFeeOverride != null
        ? String(lead.instructorFeeOverride)
        : profile && profile.fee > 0
          ? String(profile.fee)
          : ""

  return {
    selectValue: name,
    instructorId: lead?.instructorId || profile?.id,
    instructorName: name,
    fee,
  }
}

export function resolvedInstructorName(value: InstructorAssignValue): string {
  if (
    value.selectValue === UNASSIGNED_INSTRUCTOR_VALUE ||
    isInstructorUnassigned(value.selectValue)
  ) {
    return UNASSIGNED_INSTRUCTOR
  }
  return value.instructorName.trim() || value.selectValue
}
