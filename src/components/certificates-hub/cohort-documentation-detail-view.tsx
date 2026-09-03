"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
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
import type { CohortDocumentationRow } from "@/lib/cohort-documentation"
import {
  formatCohortFileSize,
  parseCohortSessionDuration,
  uniqueCohortExcelFiles,
  isCohortFileOnlyRow,
} from "@/lib/cohort-documentation"
import {
  addCohortExcelFilesAction,
  deleteCohortDocumentationAction,
  listCohortDocumentationAction,
  listCohortNameOptionsAction,
  updateCohortDocumentationAction,
} from "@/lib/cohort-documentation-actions"
import { formatCurrency, formatDate } from "@/lib/helpers"
import { cn } from "@/lib/utils"

const NEW_COHORT = "__new__"

export function CohortDocumentationDetailView({
  cohortName,
}: {
  cohortName: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<CohortDocumentationRow[]>([])
  const [cohortOptions, setCohortOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [addFilesOpen, setAddFilesOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileNotes, setFileNotes] = useState("")
  const [fileDriveUrl, setFileDriveUrl] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
      listCohortDocumentationAction({ cohortName }),
      listCohortNameOptionsAction(),
    ])
    setLoading(false)
    if (!docsRes.ok) toast.error(docsRes.error)
    else setRows(docsRes.data)
    if (namesRes.ok) setCohortOptions(namesRes.data)
  }, [cohortName])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const files = useMemo(() => uniqueCohortExcelFiles(rows), [rows])
  const sessions = useMemo(
    () =>
      [...rows]
        .filter((row) => !isCohortFileOnlyRow(row))
        .sort(
          (a, b) =>
            b.sessionDate.localeCompare(a.sessionDate, "he") ||
            (b.sessionNumber ?? 0) - (a.sessionNumber ?? 0),
        ),
    [rows],
  )

  const isAllowedExcel = (file: File) => {
    const lower = file.name.toLowerCase()
    return (
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      lower.endsWith(".csv")
    )
  }

  const pickFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return
    const next = Array.from(incoming)
    if (next.some((file) => !isAllowedExcel(file))) {
      toast.error("רק קבצי Excel או CSV (.xlsx, .xls, .csv)")
      return
    }
    setSelectedFiles(next)
  }

  const pickEditFile = (file: File | null) => {
    if (!file) return
    if (!isAllowedExcel(file)) {
      toast.error("רק קבצי Excel או CSV (.xlsx, .xls, .csv)")
      return
    }
    setEditSelectedFile(file)
  }

  const resetAddFiles = () => {
    setSelectedFiles([])
    setFileNotes("")
    setFileDriveUrl("")
    setDragOver(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  const submitAddFiles = async () => {
    if (!selectedFiles.length) {
      toast.error("יש לבחור לפחות קובץ אחד")
      return
    }
    const fd = new FormData()
    fd.set("cohortName", cohortName)
    for (const file of selectedFiles) fd.append("files", file)
    if (fileNotes.trim()) fd.set("notes", fileNotes.trim())
    if (fileDriveUrl.trim()) fd.set("driveUrl", fileDriveUrl.trim())

    setUploading(true)
    const res = await addCohortExcelFilesAction(fd)
    setUploading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      res.data.count > 1
        ? `נוספו ${res.data.count} קבצי אקסל`
        : "קובץ האקסל נוסף למחזור",
    )
    setAddFilesOpen(false)
    resetAddFiles()
    void refresh()
  }

  const openEdit = (row: CohortDocumentationRow) => {
    const duration = parseCohortSessionDuration(row.durationHours)
    const inOptions = cohortOptions.includes(row.cohortName)
    setEditRow(row)
    setEditCohortMode(inOptions ? row.cohortName : NEW_COHORT)
    setEditNewCohortName(inOptions ? "" : row.cohortName)
    setEditSessionNumber(
      row.sessionNumber != null ? String(row.sessionNumber) : "",
    )
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

  const submitEdit = async () => {
    if (!editRow) return
    const nextCohortName =
      editCohortMode === NEW_COHORT
        ? editNewCohortName.trim()
        : editCohortMode

    if (!nextCohortName) {
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
    fd.set("cohortName", nextCohortName)
    if (editSessionNumber.trim()) {
      fd.set("sessionNumber", editSessionNumber.trim())
    }
    fd.set("sessionDate", editSessionDate)
    fd.set("timeFrom", editTimeFrom)
    fd.set("timeTo", editTimeTo)
    fd.set("hours", editHours)
    if (editInstructorName.trim()) {
      fd.set("instructorName", editInstructorName.trim())
    }
    if (editDriveUrl.trim()) fd.set("driveUrl", editDriveUrl.trim())
    if (editNotes.trim()) fd.set("notes", editNotes.trim())
    fd.set("isPaid", editIsPaid ? "true" : "false")
    if (editIsPaid && editPaidAmount.trim()) {
      fd.set("paidAmount", editPaidAmount.trim())
    }
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
    toast.success("נמחק")
    void refresh()
  }

  return (
    <div className="min-h-0 w-full max-w-full overflow-x-hidden">
      <PageHeader
        title={cohortName}
        subtitle="קבצי אקסל ותיעוד מפגשים של המחזור"
        back={
          <Link
            href="/certificates/cohort-docs"
            aria-label="חזרה לתיעוד מחזורים"
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
            onClick={() => {
              resetAddFiles()
              setAddFilesOpen(true)
            }}
          >
            <Plus className="size-4" />
            הוספת קובץ אקסל
          </Button>
        }
      />

      <div className="space-y-6 p-4 md:p-6">
        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <FileSpreadsheet className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">קבצי אקסל</h2>
            <span className="text-xs text-muted-foreground">
              {files.length}
            </span>
          </div>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              טוען…
            </p>
          ) : files.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              אין עדיין קבצי אקסל למחזור זה
            </p>
          ) : (
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">שם קובץ</th>
                  <th className="px-3 py-2.5 font-semibold">גודל</th>
                  <th className="px-3 py-2.5 font-semibold">תאריך העלאה</th>
                  <th className="px-3 py-2.5 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.fileUrl}
                    className="border-t border-border hover:bg-secondary/30"
                  >
                    <td
                      className="max-w-[280px] truncate px-3 py-2.5 font-medium"
                      title={file.fileName}
                    >
                      {file.fileName}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatCohortFileSize(file.fileSize)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {formatDate(file.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/cohort-documentation/${file.downloadId}/file`}
                          download={file.fileName}
                          className="flex size-9 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                          title="הורד אקסל"
                          aria-label="הורד אקסל"
                        >
                          <Download className="size-4" />
                        </a>
                        {file.driveUrl ? (
                          <a
                            href={file.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex size-9 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                            title="Google Drive"
                            aria-label="Google Drive"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                        {file.fileOnly ? (
                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteId(file.downloadId)}
                            title="מחיקת קובץ"
                            aria-label="מחיקת קובץ"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold">מפגשים</h2>
          </div>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              טוען…
            </p>
          ) : sessions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              אין מפגשים מתועדים למחזור זה
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">מס&apos; מפגש</th>
                  <th className="px-3 py-2.5 font-semibold">תאריך</th>
                  <th className="px-3 py-2.5 font-semibold">שם</th>
                  <th className="px-3 py-2.5 font-semibold">שעות</th>
                  <th className="px-3 py-2.5 font-semibold">תשלום</th>
                  <th className="px-3 py-2.5 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border hover:bg-secondary/30"
                  >
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
        </section>
      </div>

      <Dialog
        open={addFilesOpen}
        onOpenChange={(open) => {
          setAddFilesOpen(open)
          if (!open) resetAddFiles()
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>הוספת קבצי אקסל למחזור</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-sm">קבצי Excel / CSV</Label>
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
                  pickFiles(e.dataTransfer.files)
                }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mb-2 size-6 text-muted-foreground" />
                {selectedFiles.length ? (
                  <ul className="space-y-1 text-sm font-medium">
                    {selectedFiles.map((file) => (
                      <li key={`${file.name}-${file.size}`}>{file.name}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      גררו קבצים או לחצו לבחירה
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ניתן לבחור כמה קבצים יחד · .xlsx · .xls · .csv
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => {
                  pickFiles(e.target.files)
                  e.target.value = ""
                }}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">
                קישור Google Drive (אופציונלי)
              </Label>
              <Input
                value={fileDriveUrl}
                onChange={(e) => setFileDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                dir="ltr"
                className="text-left"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">הערות</Label>
              <Textarea
                rows={3}
                value={fileNotes}
                onChange={(e) => setFileNotes(e.target.value)}
                placeholder="הערות לקבצים…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={uploading}
              onClick={() => void submitAddFiles()}
            >
              {uploading ? "מעלה…" : "הוספה למחזור"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => setAddFilesOpen(false)}
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
                <Label className="mb-1.5 block text-sm">
                  שם (מדריך / מדווח)
                </Label>
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
                    <p className="text-sm font-medium">
                      {editSelectedFile.name}
                    </p>
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
        title="מחיקה"
        description="למחוק את הרשומה? אם אין קבצים אחרים שמשתמשים באותו קובץ, הוא יימחק מהשרת."
        confirmLabel="כן, מחק"
        confirming={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
