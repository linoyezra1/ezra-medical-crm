"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  lookupExamSession,
  saveExamDraft,
  submitExam,
} from "@/lib/exam-actions"
import {
  EXAM_PASS_SCORE,
  EXAM_TARGET_QUESTION_COUNT,
  firstUnansweredIndex,
  scoreExamAnswers,
  type ExamAnswers,
  type ExamQuestionDto,
} from "@/lib/exam-questions"
import { cn } from "@/lib/utils"

const LS_KEY = (id: string) => `ezra-exam-draft:${id}`

type Phase = "login" | "exam" | "review" | "done"

function loadLocalDraft(idNumber: string): ExamAnswers {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(LS_KEY(idNumber))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ExamAnswers
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function saveLocalDraft(idNumber: string, answers: ExamAnswers) {
  try {
    localStorage.setItem(LS_KEY(idNumber), JSON.stringify(answers))
  } catch {
    /* ignore quota */
  }
}

function clearLocalDraft(idNumber: string) {
  try {
    localStorage.removeItem(LS_KEY(idNumber))
  } catch {
    /* ignore */
  }
}

export function DigitalExamView() {
  const [phase, setPhase] = useState<Phase>("login")
  const [idNumber, setIdNumber] = useState("")
  const [fullName, setFullName] = useState("")
  const [answers, setAnswers] = useState<ExamAnswers>({})
  const [questions, setQuestions] = useState<ExamQuestionDto[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [showUnansweredHint, setShowUnansweredHint] = useState(false)
  const [missingIds, setMissingIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(
    null,
  )

  const total = questions.length || EXAM_TARGET_QUESTION_COUNT
  const question = questions[qIndex]
  const progress = total > 0 ? ((qIndex + 1) / total) * 100 : 0
  const selected = question ? answers[question.id] || "" : ""

  const persistDraft = useCallback(
    async (next: ExamAnswers) => {
      if (!idNumber.trim()) return
      saveLocalDraft(idNumber.trim(), next)
      void saveExamDraft({
        idNumber: idNumber.trim(),
        fullName: fullName.trim(),
        answers: next,
      })
    },
    [idNumber, fullName],
  )

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await lookupExamSession({
      idNumber: idNumber.trim(),
      fullName: fullName.trim(),
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }

    const local = loadLocalDraft(res.data.idNumber)
    const allowed = new Set(res.data.questions.map((q) => q.id))
    const filteredLocal: ExamAnswers = {}
    for (const [k, v] of Object.entries(local)) {
      if (allowed.has(k) && v?.trim()) filteredLocal[k] = v
    }
    const merged: ExamAnswers = { ...filteredLocal, ...res.data.answers }
    setIdNumber(res.data.idNumber)
    setFullName(res.data.fullName)
    setAnswers(merged)
    setQuestions(res.data.questions)

    if (res.data.alreadyCompleted && res.data.examScore != null) {
      setResult({
        score: res.data.examScore,
        passed: Boolean(res.data.examPassed),
      })
      setPhase("done")
      toast.message("המבחן כבר הוגש בעבר — מציגים את הציון השמור")
      return
    }

    const startIdx = firstUnansweredIndex(res.data.questions, merged)
    setQIndex(startIdx)
    setPhase("exam")
    if (res.data.hasDraft || Object.keys(local).length > 0) {
      toast.success("טיוטה נמצאה — ממשיכים מהשאלה האחרונה שלא נענתה")
    }
  }

  const selectAnswer = (option: string) => {
    if (!question) return
    const next = { ...answers, [question.id]: option }
    setAnswers(next)
    setShowUnansweredHint(false)
    void persistDraft(next)
  }

  const goNext = () => {
    if (!question) return
    if (!selected) setShowUnansweredHint(true)
    if (qIndex >= total - 1) {
      setPhase("review")
      return
    }
    setQIndex((i) => i + 1)
    setShowUnansweredHint(false)
  }

  const goPrev = () => {
    if (qIndex <= 0) return
    setQIndex((i) => i - 1)
    setShowUnansweredHint(false)
  }

  const onSaveAndExit = async () => {
    setBusy(true)
    await persistDraft(answers)
    setBusy(false)
    toast.success("הטיוטה נשמרה — ניתן להמשיך מאוחר יותר עם אותו מספר ת״ז")
    setPhase("login")
  }

  const onSubmit = async () => {
    const scored = scoreExamAnswers(questions, answers)
    if (scored.unansweredIds.length) {
      setMissingIds(scored.unansweredIds)
      toast.error("יש לענות על כל השאלות לפני ההגשה")
      return
    }
    setMissingIds([])
    setBusy(true)
    const res = await submitExam({
      idNumber: idNumber.trim(),
      fullName: fullName.trim(),
      answers,
    })
    setBusy(false)
    if (!res.ok) {
      if (res.code === "unanswered") {
        const again = scoreExamAnswers(questions, answers)
        setMissingIds(again.unansweredIds)
      }
      toast.error(res.error)
      return
    }
    clearLocalDraft(idNumber.trim())
    setResult({ score: res.data.score, passed: res.data.passed })
    setPhase("done")
  }

  const jumpToMissing = (id: string) => {
    const idx = questions.findIndex((q) => q.id === id)
    if (idx >= 0) {
      setQIndex(idx)
      setPhase("exam")
      setShowUnansweredHint(true)
    }
  }

  const missingNumbers = useMemo(() => {
    return missingIds.map((id) => {
      const idx = questions.findIndex((q) => q.id === id)
      return { id, num: idx >= 0 ? idx + 1 : 0 }
    })
  }, [missingIds, questions])

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id]?.trim()).length,
    [answers, questions],
  )

  useEffect(() => {
    setShowUnansweredHint(false)
  }, [qIndex])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-4 py-6">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ClipboardList className="size-6" />
        </div>
        <h1 className="text-xl font-bold">מבחן דיגיטלי בעזרה ראשונה</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {EXAM_TARGET_QUESTION_COUNT} שאלות · {EXAM_PASS_SCORE} נקודות ומעלה
          לציון עובר
        </p>
      </header>

      {phase === "login" ? (
        <form onSubmit={onStart} className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div>
            <Label className="mb-1.5 block">מספר תעודת זהות</Label>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              dir="ltr"
              inputMode="numeric"
              required
              autoComplete="off"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">שם מלא</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "טוען…" : "התחלת מבחן"}
          </Button>
        </form>
      ) : null}

      {phase === "exam" && question ? (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                שאלה {qIndex + 1} מתוך {total}
              </span>
              <span>
                {answeredCount}/{total} נענו
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-base font-semibold leading-relaxed">
              {question.question}
            </p>
            <div className="mt-4 space-y-2">
              {question.options.map((opt) => {
                const active = selected === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => selectAnswer(opt)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-right text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border bg-background hover:bg-secondary/60",
                    )}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {showUnansweredHint && !selected ? (
              <p className="mt-3 text-sm font-medium text-amber-700">
                לא ענית על השאלה
              </p>
            ) : null}
          </div>

          <div className="mt-auto flex gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={goPrev}
              disabled={qIndex === 0}
            >
              <ArrowRight className="size-4" />
              הקודם
            </Button>
            <Button type="button" className="flex-1 gap-2" onClick={goNext}>
              {qIndex >= total - 1 ? "לסיכום" : "הבא"}
              <ArrowLeft className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => void onSaveAndExit()}
          >
            שמור וצא (המשך מאוחר יותר)
          </Button>
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-lg font-bold">הגשת מבחן</h2>
          <p className="text-sm text-muted-foreground">
            נענו {answeredCount} מתוך {total} שאלות. יש לענות על כל השאלות לפני
            ההגשה.
          </p>
          {missingNumbers.length > 0 ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="mb-2 text-sm font-semibold text-destructive">
                שאלות חסרות:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingNumbers.map(({ id, num }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => jumpToMissing(id)}
                    className="rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive"
                  >
                    שאלה {num || "?"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void onSubmit()}
            >
              {busy ? "שולח…" : "הגש מבחן"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void onSaveAndExit()}
            >
              שמור וצא (המשך מאוחר יותר)
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPhase("exam")}
            >
              חזרה לשאלות
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "done" && result ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center animate-in fade-in zoom-in-95 duration-500">
          <CheckCircle2
            className={cn(
              "size-16",
              result.passed ? "text-emerald-600" : "text-red-600",
            )}
          />
          <h2 className="text-2xl font-bold">המבחן הוגש בהצלחה</h2>
          <p
            className={cn(
              "rounded-2xl px-6 py-4 text-3xl font-black tabular-nums",
              result.passed
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700",
            )}
          >
            {result.score}/100
          </p>
          <p
            className={cn(
              "text-base font-semibold",
              result.passed ? "text-emerald-700" : "text-red-700",
            )}
          >
            {result.passed
              ? "עבר/ה בהצלחה"
              : `ציון מתחת ל־${EXAM_PASS_SCORE} — לא עבר/ה`}
          </p>
          <p className="text-sm text-muted-foreground">{fullName}</p>
        </div>
      ) : null}
    </div>
  )
}
