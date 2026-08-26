"use client"

import { EXAM_PASS_SCORE, draftAnswerCount } from "@/lib/exam-questions"
import { cn } from "@/lib/utils"

export type ExamStatusProps = {
  examScore?: number | null
  examPassed?: boolean | null
  examCompletedAt?: string | null
  examDraftAnswers?: Record<string, string> | null
  className?: string
}

export function ExamScoreBadge({
  examScore,
  examPassed,
  examCompletedAt,
  examDraftAnswers,
  className,
}: ExamStatusProps) {
  const completed =
    examCompletedAt != null && examScore != null && Number.isFinite(examScore)
  const draftCount = draftAnswerCount(examDraftAnswers || undefined)

  if (completed) {
    const score = Number(examScore)
    const passed = examPassed ?? score >= EXAM_PASS_SCORE
    const good = score >= EXAM_PASS_SCORE
    return (
      <div
        className={cn(
          "rounded-xl px-3 py-2 text-sm font-bold",
          good
            ? "bg-emerald-50 text-emerald-800"
            : "bg-red-50 text-red-700",
          className,
        )}
      >
        ציון מבחן: {score}/100
        <span className="mx-1 opacity-60">·</span>
        {passed ? "עבר/ה בהצלחה" : "לא עבר/ה"}
      </div>
    )
  }

  if (draftCount > 0) {
    return (
      <div
        className={cn(
          "rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900",
          className,
        )}
      >
        מבחן בתהליך (טיוטה נשמרה)
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      טרם ביצע/ה מבחן
    </div>
  )
}
