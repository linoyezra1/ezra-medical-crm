"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Download,
  ExternalLink,
  FolderArchive,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  CohortDocumentationRow,
  CohortSessionDraft,
} from "@/lib/cohort-documentation"
import { emptyCohortSessionDraft, parseCohortSessionDuration } from "@/lib/cohort-documentation"
import {
  deleteCohortDocumentationAction,
  listCohortDocumentationAction,
  listCohortNameOptionsAction,
  updateCohortDocumentationAction,
  uploadCohortDocumentationAction,
} from "@/lib/cohort-documentation-actions"
import { formatCurrency } from "@/lib/helpers"
import { cn } from "@/lib/utils"

const ALL_COHORTS = "__all__"
const NEW_COHORT = "__new__"
const SESSION_COUNT_OPTIONS = ["1", "2", "3", "4", "5"] as const

function resizeSessions(count: number, prev: CohortSessionDraft[]): CohortSessionDraft[] {
  const next = [...prev]
  while (next.length < count) next.push(emptyCohortSessionDraft())
  return next.slice(0, count)
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CohortDocumentationView() {
  const fileRef = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<CohortDocumentationRow[]>([])
  const [cohortOptions, setCohortOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [cohortFilter, setCohortFilter] = useState(ALL_COHORTS)
  const [query, setQuery] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [cohortMode, setCohortMode] = useState<string>(NEW_COHORT)
  const [newCohortName, setNewCohortName] = useState("")
  const [sessionCount, setSessionCount] = useState("1")
  const [sessions, setSessions] = useState<CohortSessionDraft[]>([
    emptyCohortSessionDraft(),
  ])
  const [instructorName, setInstructorName] = useState("")
  const [driveUrl, setDriveUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [isPaid, setIsPaid] = useState(false)
  const [paidAmount, setPaidAmount] = useState("")

  const [editRow, setEditRow] = useState<CohortDocumentationRow | null>(null)
  const [editCohortMode, setEditCohortMode] = useState<string>(NEW_COHORT)
  const [editNewCohortName, setEditNewCohortName] = useState("")
  const [editSessionNumber, setEditSessionNumber] = useState("")
  const [editSessionDate, setEditSessionDate] = useState("")
  const [editTimeFrom, setEditTimeFrom] = useState("")
  const [editTimeTo, setEditTimeTo] = useState("")
  const [editHours, setEditHours] = useState("")
  const [editInstructorName, setEditInstructorName] = useState("")
  const [editDriveUrl, setEditDriveUrl] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editIsPaid, setEditIsPaid] = useState(false)
  const [editPaidAmount, setEditPaidAmount] = useState("")
  const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null)
  const [editDragOver, setEditDragOver] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [docsRes, namesRes] = await Promise.all([
      listCohortDocumentationAction({
        cohortName: cohortFilter === ALL_COHORTS ? undefined : cohortFilter,
        query,
      }),
      listCohortNameOptionsAction(),
    ])
    setLoading(false)
    if (!docsRes.ok) toast.error(docsRes.error)
    else setRows(docsRes.data)
    if (namesRes.ok) setCohortOptions(namesRes.data)
  }, [cohortFilter, query])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resetUploadForm = () => {
    setCohortMode(cohortOptions[0] ?? NEW_COHORT)
    setNewCohortName("")
    setSessionCount("1")
    setSessions([emptyCohortSessionDraft()])
    setInstructorName("")
    setDriveUrl("")
    setNotes("")
    setIsPaid(false)
    setPaidAmount("")
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const openUpload = () => {
    resetUploadForm()
    setCohortMode(cohortOptions[0] ?? NEW_COHORT)
    setUploadOpen(true)
  }

  const openEdit = (row: CohortDocumentationRow) => {
    const duration = parseCohortSessionDuration(row.durationHours)
    const inOptions = cohortOptions.includes(row.cohortName)
    setEditRow(row)
    setEditCohortMode(inOptions ? row.cohortName : NEW_COHORT)
    setEditNewCohortName(inOptions ? "" : row.cohortName)
    setEditSessionNumber(row.sessionNumber != null ? String(row.sessionNumber) : "")
    setEditSessionDate(row.sessionDate)
    setEditTimeFrom(duration.timeFrom)
    setEditTimeTo(duration.timeTo)
    setEditHours(duration.hours)
    setEditInstructorName(row.instructorName ?? "")
    setEditDriveUrl(row.driveUrl ?? "")
    setEditNotes(row.notes ?? "")
    setEditIsPaid(row.isPaid)
    setEditPaidAmount(row.paidAmount != null ? String(row.paidAmount) : "")
    setEditSelectedFile(null)
    setEditDragOver(false)
    if (editFileRef.current) editFileRef.current.value = ""
  }

  const closeEdit = () => {
    setEditRow(null)
    setEditSelectedFile(null)
    if (editFileRef.current) editFileRef.current.value = ""
  }

  const pickFile = (file: File | null) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (
      !lower.endsWith(".xlsx") &&
      !lower.endsWith(".xls") &&
      !lower.endsWith(".csv")
    ) {
      toast.error("רק קבצי Excel או CSV (.xlsx, .xls, .csv)")
      return
    }
    setSelectedFile(file)
  }

  const pickEditFile = (file: File | null) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (
      !lower.endsWith(".xlsx") &&
      !lower.endsWith(".xls") &&
      !lower.endsWith(".csv")
    ) {
      toast.error("רק קבצי Excel או CSV (.xlsx, .xls, .csv)")
      return
    }
    setEditSelectedFile(file)
  }

  const submitUpload = async () => {
    const cohortName =
      cohortMode === NEW_COHORT ? newCohortName.trim() : cohortMode

    if (!cohortName) {
      toast.error("יש לבחור או להזין שם מחזור")
      return
    }
    for (let i = 0; i < sessions.length; i++) {
      if (!sessions[i]?.date.trim()) {
        toast.error(`יש לבחור תאריך למפגש ${i + 1}`)
        return
      }
    }
    if (!selectedFile) {
      toast.error("יש לבחור קובץ")
      return
    }
    if (isPaid) {
      const amount = Number(paidAmount)
      if (!paidAmount.trim() || Number.isNaN(amount) || amount <= 0) {
        toast.error("יש להזין סכום תשלום תקין")
        return
      }
    }

    const fd = new FormData()
    fd.set("cohortName", cohortName)
    fd.set("sessionsJson", JSON.stringify(sessions))
    if (instructorName.trim()) fd.set("instructorName", instructorName.trim())
    if (driveUrl.trim()) fd.set("driveUrl", driveUrl.trim())
    if (notes.trim()) fd.set("notes", notes.trim())
    fd.set("isPaid", isPaid ? "true" : "false")
    if (isPaid && paidAmount.trim()) fd.set("paidAmount", paidAmount.trim())
    fd.set("file", selectedFile)

    setUploading(true)
    const res = await uploadCohortDocumentationAction(fd)
    setUploading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      res.data.count > 1
        ? `נשמרו ${res.data.count} מפגשים בארכיון`
        : "התיעוד הועלה ונשמר בארכיון",
    )
    setUploadOpen(false)
    void refresh()
  }

  const submitEdit = async () => {
    if (!editRow) return
    const cohortName =
      editCohortMode === NEW_COHORT
        ? editNewCohortName.trim()
        : editCohortMode

    if (!cohortName) {
      toast.error("יש לבחור או להזין שם מחזור")
      return
    }
    if (!editSessionDate.trim()) {
      toast.error("יש לבחור תאריך מפגש")
      return
    }
    if (editIsPaid) {
      const amount = Number(editPaidAmount)
      if (!editPaidAmount.trim() || Number.isNaN(amount) || amount <= 0) {
        toast.error("יש להזין סכום תשלום תקין")
        return
      }
    }

    const fd = new FormData()
    fd.set("id", editRow.id)
    fd.set("cohortName", cohortName)
    if (editSessionNumber.trim()) fd.set("sessionNumber", editSessionNumber.trim())
    fd.set("sessionDate", editSessionDate)
    fd.set("timeFrom", editTimeFrom)
    fd.set("timeTo", editTimeTo)
    fd.set("hours", editHours)
    if (editInstructorName.trim()) fd.set("instructorName", editInstructorName.trim())
    if (editDriveUrl.trim()) fd.set("driveUrl", editDriveUrl.trim())
    if (editNotes.trim()) fd.set("notes", editNotes.trim())
    fd.set("isPaid", editIsPaid ? "true" : "false")
    if (editIsPaid && editPaidAmount.trim()) fd.set("paidAmount", editPaidAmount.trim())
    if (editSelectedFile) fd.set("file", editSelectedFile)

    setSavingEdit(true)
    const res = await updateCohortDocumentationAction(fd)
    setSavingEdit(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התיעוד עודכן")
    closeEdit()
    void refresh()
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const res = await deleteCohortDocumentationAction(deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התיעוד נמחק")
    void refresh()
  }

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.sessionDate.localeCompare(a.sessionDate, "he") ||
          (b.sessionNumber ?? 0) - (a.sessionNumber ?? 0),
      ),
    [rows],
  )

  return (
    <div className="min-h-0 w-full max-w-full overflow-x-hidden">
      <PageHeader
        title="תיעוד מחזורים וקבצים"
        subtitle="ארכיון קבצי Excel ותיעוד מפגשים לפי מחזור"
        back={
          <Link
            href="/certificates"
            aria-label="חזרה לניהול תעודות"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <ArrowRight className="size-5" />
          </Link>
        }
        action={
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={openUpload}
          >
            <Plus className="size-4" />
            העלאת תיעוד חדש
          </Button>
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <FolderArchive className="size-5 shrink-0 text-primary" />
          <Select
            value={cohortFilter}
            onValueChange={(v) => setCohortFilter(v || ALL_COHORTS)}
          >
            <SelectTrigger className="h-9 min-w-[180px] text-xs">
              <SelectValue placeholder="כל המחזורים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COHORTS}>כל המחזורים</SelectItem>
              {cohortOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם / מדריך / קובץ…"
            className="h-9 max-w-md flex-1 text-xs"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              טוען…
            </p>
          ) : sortedRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              אין תיעודים בארכיון — העלו קובץ Excel ראשון
            </p>
          ) : (
            <table className="w-full min-w-[880px] text-right text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 font-semibold">מחזור</th>
                  <th className="px-3 py-2.5 font-semibold">מס&apos; מפגש</th>
                  <th className="px-3 py-2.5 font-semibold">תאריך</th>
                  <th className="px-3 py-2.5 font-semibold">שם</th>
                  <th className="px-3 py-2.5 font-semibold">שעות</th>
                  <th className="px-3 py-2.5 font-semibold">תשלום</th>
                  <th className="px-3 py-2.5 font-semibold">שם קובץ</th>
                  <th className="px-3 py-2.5 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border hover:bg-secondary/30"
                  >
                    <td className="px-3 py-2.5 font-medium">{row.cohortName}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.sessionNumber ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {row.sessionDate}
                    </td>
                    <td className="px-3 py-2.5">{row.instructorName || "—"}</td>
                    <td className="px-3 py-2.5">{row.durationHours || "—"}</td>
                    <td className="px-3 py-2.5">
                      {row.isPaid ? (
                        <span className="inline-block rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                          שולם
                          {row.paidAmount != null
                            ? ` · ${formatCurrency(row.paidAmount)}`
                            : null}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          לא שולם
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5" title={row.fileName}>
                      {row.fileName}
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {formatFileSize(row.fileSize)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                          onClick={() => openEdit(row)}
                          title="עריכת פרטים"
                          aria-label="עריכת פרטים"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <a
                          href={`/api/cohort-documentation/${row.id}/file`}
                          download={row.fileName}
                          className="flex size-9 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                          title="הורד אקסל"
                          aria-label="הורד אקסל"
                        >
                          <Download className="size-4" />
                        </a>
                        {row.driveUrl ? (
                          <a
                            href={row.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex size-9 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                            title="Google Drive"
                            aria-label="Google Drive"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="flex size-9 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(row.id)}
                          title="מחיקה"
                          aria-label="מחיקה"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>העלאת תיעוד חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-sm">מחזור</Label>
              <Select
                value={cohortMode}
                onValueChange={(v) => setCohortMode(v || NEW_COHORT)}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="בחר מחזור" />
                </SelectTrigger>
                <SelectContent>
                  {cohortOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_COHORT}>מחזור חדש…</SelectItem>
                </SelectContent>
              </Select>
              {cohortMode === NEW_COHORT ? (
                <Input
                  className="mt-2"
                  value={newCohortName}
                  onChange={(e) => setNewCohortName(e.target.value)}
                  placeholder="שם מחזור חדש"
                />
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">מספר מפגשים</Label>
              <Select
                value={sessionCount}
                onValueChange={(v) => {
                  const next = v || "1"
                  setSessionCount(next)
                  setSessions((prev) =>
                    resizeSessions(Number.parseInt(next, 10) || 1, prev),
                  )
                }}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="בחר מספר מפגשים" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n === "1" ? "מפגש אחד" : `${n} מפגשים`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              {sessions.map((session, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3"
                >
                  <p className="text-sm font-semibold">מפגש {index + 1}</p>
                  <div>
                    <Label className="mb-1.5 block text-xs text-muted-foreground">
                      תאריך
                    </Label>
                    <Input
                      type="date"
                      value={session.date}
                      onChange={(e) =>
                        setSessions((prev) =>
                          prev.map((s, i) =>
                            i === index ? { ...s, date: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1.5 block text-xs text-muted-foreground">
                        משעה
                      </Label>
                      <Input
                        type="time"
                        value={session.timeFrom}
                        onChange={(e) =>
                          setSessions((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, timeFrom: e.target.value }
                                : s,
                            ),
                          )
                        }
                        dir="ltr"
                        className="text-left"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs text-muted-foreground">
                        עד שעה
                      </Label>
                      <Input
                        type="time"
                        value={session.timeTo}
                        onChange={(e) =>
                          setSessions((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, timeTo: e.target.value }
                                : s,
                            ),
                          )
                        }
                        dir="ltr"
                        className="text-left"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs text-muted-foreground">
                      שעות (טקסט חופשי)
                    </Label>
                    <Input
                      value={session.hours}
                      onChange={(e) =>
                        setSessions((prev) =>
                          prev.map((s, i) =>
                            i === index ? { ...s, hours: e.target.value } : s,
                          ),
                        )
                      }
                      placeholder='למשל: "5 שעות" או הערה נוספת'
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">שם (מדריך / מדווח)</Label>
              <Input
                value={instructorName}
                onChange={(e) => setInstructorName(e.target.value)}
                placeholder="שם המדריך או המדווח"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-sm">
              <Checkbox
                checked={isPaid}
                onCheckedChange={(v) => {
                  const next = Boolean(v)
                  setIsPaid(next)
                  if (!next) setPaidAmount("")
                }}
                className="mt-0.5"
              />
              <span className="font-medium">המחזור שולם</span>
            </label>
            {isPaid ? (
              <div>
                <Label className="mb-1.5 block text-sm">סכום ששולם (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  dir="ltr"
                  className="text-left"
                />
              </div>
            ) : null}
            <div>
              <Label className="mb-1.5 block text-sm">קובץ Excel / CSV</Label>
              <div
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-secondary/20 hover:bg-secondary/40",
                )}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  pickFile(e.dataTransfer.files[0] ?? null)
                }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mb-2 size-6 text-muted-foreground" />
                {selectedFile ? (
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      גררו קובץ או לחצו לבחירה
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      .xlsx · .xls · .csv
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null)
                  e.target.value = ""
                }}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">
                קישור Google Drive (אופציונלי)
              </Label>
              <Input
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                dir="ltr"
                className="text-left"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">הערות</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={uploading}
              onClick={() => void submitUpload()}
            >
              {uploading ? "מעלה…" : "שמירה בארכיון"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => setUploadOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editRow)}
        onOpenChange={(open) => !open && closeEdit()}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>עריכת תיעוד מחזור</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 block text-sm">מחזור</Label>
                <Select
                  value={editCohortMode}
                  onValueChange={(v) => setEditCohortMode(v || NEW_COHORT)}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="בחר מחזור" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohortOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_COHORT}>מחזור חדש…</SelectItem>
                  </SelectContent>
                </Select>
                {editCohortMode === NEW_COHORT ? (
                  <Input
                    className="mt-2"
                    value={editNewCohortName}
                    onChange={(e) => setEditNewCohortName(e.target.value)}
                    placeholder="שם מחזור חדש"
                  />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block text-sm">מספר מפגש</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editSessionNumber}
                    onChange={(e) => setEditSessionNumber(e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm">תאריך</Label>
                  <Input
                    type="date"
                    value={editSessionDate}
                    onChange={(e) => setEditSessionDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">
                    משעה
                  </Label>
                  <Input
                    type="time"
                    value={editTimeFrom}
                    onChange={(e) => setEditTimeFrom(e.target.value)}
                    dir="ltr"
                    className="text-left"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">
                    עד שעה
                  </Label>
                  <Input
                    type="time"
                    value={editTimeTo}
                    onChange={(e) => setEditTimeTo(e.target.value)}
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">שעות (טקסט חופשי)</Label>
                <Input
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  placeholder='למשל: "5 שעות" או הערה נוספת'
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">שם (מדריך / מדווח)</Label>
                <Input
                  value={editInstructorName}
                  onChange={(e) => setEditInstructorName(e.target.value)}
                  placeholder="שם המדריך או המדווח"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-sm">
                <Checkbox
                  checked={editIsPaid}
                  onCheckedChange={(v) => {
                    const next = Boolean(v)
                    setEditIsPaid(next)
                    if (!next) setEditPaidAmount("")
                  }}
                  className="mt-0.5"
                />
                <span className="font-medium">המחזור שולם</span>
              </label>
              {editIsPaid ? (
                <div>
                  <Label className="mb-1.5 block text-sm">סכום ששולם (₪)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editPaidAmount}
                    onChange={(e) => setEditPaidAmount(e.target.value)}
                    placeholder="0"
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              ) : null}
              <div>
                <Label className="mb-1.5 block text-sm">
                  קובץ Excel / CSV (החלפה אופציונלית)
                </Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  קובץ נוכחי: {editRow.fileName}
                </p>
                <div
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                    editDragOver
                      ? "border-primary bg-primary/5"
                      : "border-border bg-secondary/20 hover:bg-secondary/40",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setEditDragOver(true)
                  }}
                  onDragLeave={() => setEditDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setEditDragOver(false)
                    pickEditFile(e.dataTransfer.files[0] ?? null)
                  }}
                  onClick={() => editFileRef.current?.click()}
                >
                  <Upload className="mb-2 size-5 text-muted-foreground" />
                  {editSelectedFile ? (
                    <p className="text-sm font-medium">{editSelectedFile.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      גררו קובץ חדש או לחצו להחלפה
                    </p>
                  )}
                </div>
                <input
                  ref={editFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    pickEditFile(e.target.files?.[0] ?? null)
                    e.target.value = ""
                  }}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">
                  קישור Google Drive (אופציונלי)
                </Label>
                <Input
                  value={editDriveUrl}
                  onChange={(e) => setEditDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">הערות</Label>
                <Textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="הערות נוספות…"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={savingEdit}
              onClick={() => void submitEdit()}
            >
              {savingEdit ? "שומר…" : "שמירת שינויים"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={savingEdit}
              onClick={closeEdit}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteId)}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="מחיקת תיעוד"
        description="למחוק את רשומת התיעוד ואת הקובץ מהשרת? לא ניתן לשחזר."
        confirmLabel="כן, מחק"
        confirming={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
