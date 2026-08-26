"use client"

import { EXAM_PASS_SCORE } from "@/lib/exam-questions"
import { cn } from "@/lib/utils"

export type ExamStatusProps = {
  examScore?: number | null
  examPassed?: boolean | null
  examCompletedAt?: string | null
  examDraftAnswers?: Record<string, string> | null
  className?: string
}

/** מציג ציון רק אם המבחן הוגש — אחרת לא מציג כלום */
export function ExamScoreBadge({
  examScore,
  examPassed,
  examCompletedAt,
  className,
}: ExamStatusProps) {
  const completed =
    examCompletedAt != null && examScore != null && Number.isFinite(examScore)

  if (!completed) return null

  const score = Number(examScore)
  const passed = examPassed ?? score >= EXAM_PASS_SCORE
  const good = score >= EXAM_PASS_SCORE

  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 text-sm font-bold",
        good ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
        className,
      )}
    >
      ציון מבחן: {score}/100
      <span className="mx-1 opacity-60">·</span>
      {passed ? "עבר/ה בהצלחה" : "לא עבר/ה"}
    </div>
  )
}
