"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  HelpCircle,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { QuestionEditorModal } from "@/components/exam/question-editor-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  deleteExamQuestion,
  listAllExamQuestionsForAdmin,
  setExamQuestionActive,
  type AdminExamQuestion,
} from "@/lib/exam-question-admin-actions"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

export function ExamQuestionsAdminView() {
  const [questions, setQuestions] = useState<AdminExamQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [page, setPage] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<AdminExamQuestion | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listAllExamQuestionsForAdmin({ q: debouncedQ || undefined })
    setLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setQuestions(res.data.questions)
    setPage(0)
  }, [debouncedQ])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(questions.length / PAGE_SIZE))
  const pageItems = useMemo(() => {
    const start = page * PAGE_SIZE
    return questions.slice(start, start + PAGE_SIZE)
  }, [questions, page])

  const openCreate = () => {
    setEditRow(null)
    setModalOpen(true)
  }

  const openEdit = (row: AdminExamQuestion) => {
    setEditRow(row)
    setModalOpen(true)
  }

  const onToggle = async (row: AdminExamQuestion) => {
    setBusyId(row.id)
    const res = await setExamQuestionActive(row.id, !row.isActive)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(row.isActive ? "השאלה הושבתה" : "השאלה הופעלה")
    void load()
  }

  const onDelete = async (row: AdminExamQuestion) => {
    const ok = window.confirm("למחוק את השאלה לצמיתות?")
    if (!ok) return
    setBusyId(row.id)
    const res = await deleteExamQuestion(row.id)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("השאלה נמחקה")
    void load()
  }

  const activeCount = questions.filter((q) => q.isActive).length

  return (
    <div>
      <PageHeader
        title="ניהול מאגר שאלות מבחן"
        subtitle={`${activeCount} פעילות מתוך ${questions.length} · נבחנים מקבלים 25 שאלות אקראיות נעולות`}
        action={
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            שאלה חדשה
          </Button>
        }
      />

      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי טקסט שאלה או תשובה…"
            className="pe-10"
          />
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">טוען…</p>
        ) : questions.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <HelpCircle className="mx-auto mb-2 size-8 text-muted-foreground/60" />
            אין שאלות במאגר — הוסיפו שאלה או הריצו seed
          </Card>
        ) : (
          pageItems.map((row, i) => {
            const num = page * PAGE_SIZE + i + 1
            return (
              <Card
                key={row.id}
                className={cn(
                  "gap-3 p-4",
                  !row.isActive && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-right">
                    <div className="mb-1 flex flex-wrap items-center justify-end gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        #{num}
                      </span>
                      {row.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          פעילה
                        </Badge>
                      ) : (
                        <Badge variant="secondary">מושבתת</Badge>
                      )}
                      <Badge variant="outline">{row.points} נק׳</Badge>
                    </div>
                    <p className="font-semibold leading-snug">{row.question}</p>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {row.options.map((opt) => {
                    const correct = opt === row.correctAnswer
                    return (
                      <li
                        key={opt}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm",
                          correct
                            ? "border-emerald-400 bg-emerald-50 font-medium text-emerald-900"
                            : "border-border bg-background text-foreground",
                        )}
                      >
                        {correct ? (
                          <span className="me-1.5 text-xs font-bold text-emerald-700">
                            נכון ·
                          </span>
                        ) : null}
                        {opt}
                      </li>
                    )
                  })}
                </ul>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busyId === row.id}
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="size-3.5" />
                    עריכה
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busyId === row.id}
                    onClick={() => void onToggle(row)}
                  >
                    <Power className="size-3.5" />
                    {row.isActive ? "השבתה" : "הפעלה"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    disabled={busyId === row.id}
                    onClick={() => void onDelete(row)}
                  >
                    <Trash2 className="size-3.5" />
                    מחיקה
                  </Button>
                </div>
              </Card>
            )
          })
        )}

        {!loading && questions.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              הקודם
            </Button>
            <span className="text-xs text-muted-foreground">
              עמוד {page + 1} מתוך {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              הבא
            </Button>
          </div>
        ) : null}
      </div>

      <QuestionEditorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        existing={editRow}
        onSaved={() => void load()}
      />
    </div>
  )
}
