"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  createExamQuestion,
  updateExamQuestion,
  type AdminExamQuestion,
} from "@/lib/exam-question-admin-actions"
import { cn } from "@/lib/utils"

const EMPTY_OPTIONS = ["", "", "", ""] as const

export function QuestionEditorModal({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: AdminExamQuestion | null
  onSaved: () => void
}) {
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState<string[]>([...EMPTY_OPTIONS])
  const [correctIndex, setCorrectIndex] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (existing) {
      const opts = [...existing.options]
      while (opts.length < 4) opts.push("")
      setQuestion(existing.question)
      setOptions(opts.slice(0, 4))
      const idx = opts.findIndex((o) => o === existing.correctAnswer)
      setCorrectIndex(idx >= 0 ? idx : 0)
      setIsActive(existing.isActive !== false)
    } else {
      setQuestion("")
      setOptions([...EMPTY_OPTIONS])
      setCorrectIndex(0)
      setIsActive(true)
    }
  }, [open, existing])

  const setOptionAt = (i: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev]
      next[i] = value
      return next
    })
  }

  const submit = async () => {
    const payload = {
      question,
      options,
      correctAnswer: (options[correctIndex] || "").trim(),
      isActive,
    }
    setBusy(true)
    const res = existing
      ? await updateExamQuestion(existing.id, payload)
      : await createExamQuestion(payload)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(existing ? "השאלה עודכנה" : "שאלה נוספה")
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">
            {existing ? "עריכת שאלה" : "שאלה חדשה"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">טקסט השאלה</Label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              required
            />
          </div>

          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Label className="mb-1.5 block">אופציה {i + 1}</Label>
              <Input
                value={options[i] ?? ""}
                onChange={(e) => setOptionAt(i, e.target.value)}
              />
            </div>
          ))}

          <div>
            <Label className="mb-2 block">בחירת התשובה הנכונה</Label>
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => {
                const label = options[i]?.trim() || `אופציה ${i + 1}`
                const selected = correctIndex === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCorrectIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-right text-sm transition-colors",
                      selected
                        ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-800"
                        : "border-border bg-background hover:bg-secondary/50",
                    )}
                  >
                    <span
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2",
                        selected
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-muted-foreground/40",
                      )}
                    />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
            <Label className="text-sm font-medium">סטטוס שאלה פעילה</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "שומר…" : existing ? "שמירת שינויים" : "הוספת שאלה"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
