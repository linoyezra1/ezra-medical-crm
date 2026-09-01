"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  ExternalLink,
  FolderArchive,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
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
  deleteCohortDocumentationAction,
  listCohortDocumentationAction,
  listCohortNameOptionsAction,
  uploadCohortDocumentationAction,
} from "@/lib/cohort-documentation-actions"
import { formatCurrency } from "@/lib/helpers"
import { cn } from "@/lib/utils"

const ALL_COHORTS = "__all__"
const NEW_COHORT = "__new__"

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CohortDocumentationModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<CohortDocumentationRow[]>([])
  const [cohortOptions, setCohortOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [cohortFilter, setCohortFilter] = useState(ALL_COHORTS)
  const [query, setQuery] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [cohortMode, setCohortMode] = useState<string>(ALL_COHORTS)
  const [newCohortName, setNewCohortName] = useState("")
  const [sessionNumber, setSessionNumber] = useState("")
  const [sessionDate, setSessionDate] = useState("")
  const [instructorName, setInstructorName] = useState("")
  const [durationHours, setDurationHours] = useState("")
  const [driveUrl, setDriveUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [isPaid, setIsPaid] = useState(false)
  const [paidAmount, setPaidAmount] = useState("")

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
    if (!open) return
    void refresh()
  }, [open, refresh])

  const resetUploadForm = () => {
    setCohortMode(cohortOptions[0] ?? NEW_COHORT)
    setNewCohortName("")
    setSessionNumber("")
    setSessionDate("")
    setInstructorName("")
    setDurationHours("")
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

  const submitUpload = async () => {
    const cohortName =
      cohortMode === NEW_COHORT
        ? newCohortName.trim()
        : cohortMode === ALL_COHORTS
          ? newCohortName.trim() || cohortOptions[0] || ""
          : cohortMode

    if (!cohortName) {
      toast.error("יש לבחור או להזין שם מחזור")
      return
    }
    if (!sessionDate.trim()) {
      toast.error("יש לבחור תאריך")
      return
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
    fd.set("sessionDate", sessionDate)
    if (sessionNumber.trim()) fd.set("sessionNumber", sessionNumber.trim())
    if (instructorName.trim()) fd.set("instructorName", instructorName.trim())
    if (durationHours.trim()) fd.set("durationHours", durationHours.trim())
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
    toast.success("התיעוד הועלה ונשמר בארכיון")
    setUploadOpen(false)
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-border px-5 py-4 text-right">
            <DialogTitle className="flex items-center gap-2 text-right">
              <FolderArchive className="size-5 text-primary" />
              תיעוד מחזורים וקבצים
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
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
              className="h-9 max-w-xs flex-1 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="mr-auto gap-1.5 rounded-xl"
              onClick={openUpload}
            >
              <Plus className="size-4" />
              העלאת תיעוד חדש
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                טוען…
              </p>
            ) : sortedRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                אין תיעודים בארכיון — העלו קובץ Excel ראשון
              </p>
            ) : (
              <table className="w-full min-w-[720px] text-right text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 font-semibold">מחזור</th>
                    <th className="px-2 py-2 font-semibold">מס&apos; מפגש</th>
                    <th className="px-2 py-2 font-semibold">תאריך</th>
                    <th className="px-2 py-2 font-semibold">שם</th>
                    <th className="px-2 py-2 font-semibold">שעות</th>
                    <th className="px-2 py-2 font-semibold">תשלום</th>
                    <th className="px-2 py-2 font-semibold">שם קובץ</th>
                    <th className="px-2 py-2 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-border hover:bg-secondary/30"
                    >
                      <td className="px-2 py-2 font-medium">{row.cohortName}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {row.sessionNumber ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {row.sessionDate}
                      </td>
                      <td className="px-2 py-2">{row.instructorName || "—"}</td>
                      <td className="px-2 py-2">{row.durationHours || "—"}</td>
                      <td className="px-2 py-2">
                        {row.isPaid ? (
                          <span className="inline-block rounded-lg bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
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
                      <td className="max-w-[160px] truncate px-2 py-2" title={row.fileName}>
                        {row.fileName}
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {formatFileSize(row.fileSize)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={`/api/cohort-documentation/${row.id}/file`}
                            download={row.fileName}
                            className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                            title="הורד אקסל"
                            aria-label="הורד אקסל"
                          >
                            <Download className="size-3.5" />
                          </a>
                          {row.driveUrl ? (
                            <a
                              href={row.driveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex size-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                              title="Google Drive"
                              aria-label="Google Drive"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteId(row.id)}
                            title="מחיקה"
                            aria-label="מחיקה"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-sm">מספר מפגש</Label>
                <Input
                  type="number"
                  min={1}
                  value={sessionNumber}
                  onChange={(e) => setSessionNumber(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">תאריך</Label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">שם (מדריך / מדווח)</Label>
              <Input
                value={instructorName}
                onChange={(e) => setInstructorName(e.target.value)}
                placeholder="שם המדריך או המדווח"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">שעות</Label>
              <Input
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder='למשל: 09:00-14:00 או "5 שעות"'
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

      <ConfirmDeleteDialog
        open={Boolean(deleteId)}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="מחיקת תיעוד"
        description="למחוק את רשומת התיעוד ואת הקובץ מהשרת? לא ניתן לשחזר."
        confirmLabel="כן, מחק"
        confirming={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

export function CohortDocumentationModalTrigger({
  className,
}: {
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 gap-2 rounded-xl", className)}
        onClick={() => setOpen(true)}
      >
        <FolderArchive className="size-4" />
        תיעוד מחזורים וקבצים
      </Button>
      <CohortDocumentationModal open={open} onOpenChange={setOpen} />
    </>
  )
}
