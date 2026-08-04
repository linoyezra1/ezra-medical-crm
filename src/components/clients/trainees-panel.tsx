"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ExternalLink,
  FileSpreadsheet,
  Link2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"
import { TraineeAddDialog } from "@/components/clients/trainee-add-dialog"
import { TraineeAssignDialog } from "@/components/clients/trainee-assign-dialog"
import { TraineeEditDialog } from "@/components/clients/trainee-edit-dialog"
import { TraineeImportDialog } from "@/components/clients/trainee-import-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { deleteTrainee, updateTrainee } from "@/lib/actions"
import { formatPhone, whatsappLink } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Trainee } from "@/lib/types"
import { cn } from "@/lib/utils"

function trainingLabel(t: Trainee) {
  return (
    t.trainings[0]?.organizerName ||
    t.trainings[0]?.leadName ||
    "—"
  )
}

export function TraineesPanel() {
  const { trainees, updateTraineeLocal, refresh } = useApp()
  const [q, setQ] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [editTrainee, setEditTrainee] = useState<Trainee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trainee | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return trainees
    return trainees.filter(
      (t) =>
        t.fullName.toLowerCase().includes(term) ||
        t.idNumber.includes(term) ||
        (t.phone || "").includes(term) ||
        (t.email || "").toLowerCase().includes(term) ||
        t.trainings.some(
          (tr) =>
            (tr.organizerName || "").toLowerCase().includes(term) ||
            tr.leadName.toLowerCase().includes(term),
        ),
    )
  }, [trainees, q])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const t of filtered) {
        if (checked) next.add(t.id)
        else next.delete(t.id)
      }
      return next
    })
  }

  const openAssign = (ids: string[]) => {
    if (!ids.length) {
      toast.error("יש לבחור לפחות מודרך אחד")
      return
    }
    setAssignIds(ids)
    setAssignOpen(true)
  }

  const patch = async (t: Trainee, data: Partial<Trainee>) => {
    updateTraineeLocal(t.id, data)
    const res = await updateTrainee(t.id, {
      certificateEmailSent: data.certificateEmailSent,
      certificateCardPrinted: data.certificateCardPrinted,
      notes: data.notes,
    })
    if (!res.ok) toast.error(res.error)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await deleteTrainee(deleteTarget.id)
    setDeleting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("המודרך נמחק לצמיתות")
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(deleteTarget.id)
      return next
    })
    setDeleteTarget(null)
    refresh()
  }

  const toolbar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        onClick={() => setImportOpen(true)}
      >
        <FileSpreadsheet className="size-4" />
        ייבוא מאקסל
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        onClick={() => setAddOpen(true)}
      >
        <Plus className="size-4" />
        הוספת מודרך ידנית
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        disabled={selectedIds.size === 0}
        onClick={() => openAssign([...selectedIds])}
      >
        <Link2 className="size-4" />
        שיוך לנבחרים
        {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
      </Button>
    </div>
  )

  const actionButtons = (t: Trainee, compact = false) => (
    <div className={cn("flex items-center gap-0.5", compact && "justify-end")}>
      <button
        type="button"
        onClick={() => setEditTrainee(t)}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="עריכה"
        title="עריכה"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setDeleteTarget(t)}
        className="flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
        aria-label="מחיקה"
        title="מחיקה"
      >
        <Trash2 className="size-3.5" />
      </button>
      {t.trainings.length === 0 && (
        <button
          type="button"
          onClick={() => openAssign([t.id])}
          className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
          aria-label="שיוך להדרכה"
          title="שיוך להדרכה"
        >
          <Link2 className="size-3.5" />
        </button>
      )}
      {t.phone && (
        <a
          href={whatsappLink(t.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
          aria-label="וואטסאפ"
          title="וואטסאפ"
        >
          <MessageCircle className="size-3.5" />
        </a>
      )}
      {t.trainings[0]?.leadId && (
        <Link
          href={`/leads/${t.trainings[0].leadId}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
          aria-label="פתח הדרכה"
          title="פתח הדרכה"
        >
          <ExternalLink className="size-3.5" />
        </Link>
      )}
    </div>
  )

  return (
    <div className="w-full max-w-full space-y-3 overflow-x-hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full min-w-0 lg:max-w-md">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש מודרך / מארגן / ת״ז"
            className="h-9 pr-10 text-sm"
          />
        </div>
        {toolbar}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {trainees.length === 0 ? (
            <div className="space-y-3">
              <p>עדיין אין מודרכים במערכת</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 rounded-xl"
                  onClick={() => setImportOpen(true)}
                >
                  <FileSpreadsheet className="size-4" />
                  ייבוא מאקסל
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl"
                  onClick={() => setAddOpen(true)}
                >
                  <UserPlus className="size-4" />
                  הוספה ידנית
                </Button>
              </div>
            </div>
          ) : (
            "לא נמצאו מודרכים"
          )}
        </div>
      ) : (
        <>
          {/* —— Desktop table —— */}
          <div className="hidden w-full max-w-full overflow-x-hidden md:block">
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-9 px-2 py-2 font-semibold">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(v) =>
                          toggleSelectAllFiltered(Boolean(v))
                        }
                        aria-label="בחר הכל"
                      />
                    </th>
                    <th className="w-[14%] px-2 py-2 font-semibold">שם מודרך</th>
                    <th className="w-[10%] px-2 py-2 font-semibold">ת״ז</th>
                    <th className="w-[11%] px-2 py-2 font-semibold">טלפון</th>
                    <th className="w-[13%] px-2 py-2 font-semibold">
                      הדרכה שיוך
                    </th>
                    <th className="w-[7%] px-2 py-2 font-semibold">מייל</th>
                    <th className="w-[7%] px-2 py-2 font-semibold">כרטיס</th>
                    <th className="w-[14%] px-2 py-2 font-semibold">הערות</th>
                    <th className="w-[16%] px-2 py-2 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const via = trainingLabel(t)
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          "border-t border-border hover:bg-secondary/30",
                          selectedIds.has(t.id) && "bg-primary/5",
                        )}
                      >
                        <td className="px-2 py-2">
                          <Checkbox
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={(v) =>
                              toggleSelected(t.id, Boolean(v))
                            }
                            aria-label={`בחירה ${t.fullName}`}
                          />
                        </td>
                        <td className="max-w-0 truncate px-2 py-2 font-medium">
                          {t.fullName}
                        </td>
                        <td
                          className="max-w-0 truncate px-2 py-2 dir-ltr text-left"
                          dir="ltr"
                        >
                          {t.idNumber}
                        </td>
                        <td
                          className="max-w-0 truncate px-2 py-2 dir-ltr text-left"
                          dir="ltr"
                        >
                          {t.phone ? formatPhone(t.phone) : "—"}
                        </td>
                        <td className="max-w-0 truncate px-2 py-2 text-muted-foreground">
                          {via}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={t.certificateEmailSent}
                              onCheckedChange={(v) =>
                                void patch(t, {
                                  certificateEmailSent: Boolean(v),
                                })
                              }
                              aria-label="נשלחה תעודה במייל"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={t.certificateCardPrinted}
                              onCheckedChange={(v) =>
                                void patch(t, {
                                  certificateCardPrinted: Boolean(v),
                                })
                              }
                              aria-label="הודפס כרטיס תעודה"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            value={t.notes || ""}
                            onChange={(e) =>
                              updateTraineeLocal(t.id, {
                                notes: e.target.value,
                              })
                            }
                            onBlur={(e) =>
                              void patch(t, { notes: e.target.value })
                            }
                            placeholder="הערות"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-2">{actionButtons(t, true)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* —— Mobile cards —— */}
          <div className="space-y-2 md:hidden">
            {filtered.map((t) => {
              const open = expandedId === t.id
              const via = trainingLabel(t)
              const selected = selectedIds.has(t.id)
              return (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-2xl border border-border bg-card p-3",
                    selected && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(v) =>
                        toggleSelected(t.id, Boolean(v))
                      }
                      aria-label={`בחירה ${t.fullName}`}
                      className="mt-1"
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-right"
                      onClick={() => setExpandedId(open ? null : t.id)}
                    >
                      <p className="text-sm font-semibold">{t.fullName}</p>
                      <p
                        className="text-[11px] text-muted-foreground"
                        dir="ltr"
                      >
                        {t.idNumber}
                        {t.phone ? ` · ${t.phone}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-primary">
                        הדרכה דרך: {via}
                      </p>
                    </button>
                  </div>

                  <div className="mt-2 flex justify-end border-t border-border pt-2">
                    {actionButtons(t)}
                  </div>

                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={t.certificateEmailSent}
                          onCheckedChange={(v) =>
                            void patch(t, {
                              certificateEmailSent: Boolean(v),
                            })
                          }
                        />
                        נשלחה תעודה במייל
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={t.certificateCardPrinted}
                          onCheckedChange={(v) =>
                            void patch(t, {
                              certificateCardPrinted: Boolean(v),
                            })
                          }
                        />
                        הודפס כרטיס תעודה
                      </label>
                      <Textarea
                        value={t.notes || ""}
                        onChange={(e) =>
                          updateTraineeLocal(t.id, { notes: e.target.value })
                        }
                        onBlur={(e) => void patch(t, { notes: e.target.value })}
                        placeholder="הערות"
                        rows={2}
                        className="text-xs"
                      />
                      {t.trainings.map((tr) => (
                        <p
                          key={tr.participantId}
                          className="text-[11px] text-muted-foreground"
                        >
                          הדרכה דרך: {tr.organizerName || tr.leadName}
                          {tr.courseDate ? ` · ${tr.courseDate}` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <TraineeImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <TraineeAddDialog open={addOpen} onOpenChange={setAddOpen} />
      <TraineeEditDialog
        trainee={editTrainee}
        open={Boolean(editTrainee)}
        onOpenChange={(v) => {
          if (!v) setEditTrainee(null)
        }}
      />
      <TraineeAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        traineeIds={assignIds}
        onAssigned={() => setSelectedIds(new Set())}
      />
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        title="אישור מחיקה"
        description="האם אתה בטוח שברצונך למחוק מודרך זה? המודרך ימחק לצמיתות גם מההדרכה המשויכת."
        confirmLabel="אישור מחיקה"
        cancelLabel="ביטול"
        confirming={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
