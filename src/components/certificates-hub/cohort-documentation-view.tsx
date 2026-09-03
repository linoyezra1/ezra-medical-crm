"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  ChevronLeft,
  FolderArchive,
  Plus,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
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
import type { CohortSessionDraft } from "@/lib/cohort-documentation"
import {
  cohortDocsDetailHref,
  emptyCohortSessionDraft,
  summarizeCohortDocs,
  type CohortDocumentationRow,
} from "@/lib/cohort-documentation"
import {
  listCohortDocumentationAction,
  listCohortNameOptionsAction,
  uploadCohortDocumentationAction,
} from "@/lib/cohort-documentation-actions"
import { formatCurrency } from "@/lib/helpers"
import { cn } from "@/lib/utils"

const NEW_COHORT = "__new__"
const SESSION_COUNT_OPTIONS = ["1", "2", "3", "4", "5"] as const

function resizeSessions(
  count: number,
  prev: CohortSessionDraft[],
): CohortSessionDraft[] {
  const next = [...prev]
  while (next.length < count) next.push(emptyCohortSessionDraft())
  return next.slice(0, count)
}

export function CohortDocumentationView() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<CohortDocumentationRow[]>([])
  const [cohortOptions, setCohortOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
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

  const refresh = useCallback(async () => {
    setLoading(true)
    const [docsRes, namesRes] = await Promise.all([
      listCohortDocumentationAction({ query }),
      listCohortNameOptionsAction(),
    ])
    setLoading(false)
    if (!docsRes.ok) toast.error(docsRes.error)
    else setRows(docsRes.data)
    if (namesRes.ok) setCohortOptions(namesRes.data)
  }, [query])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const cohorts = useMemo(() => summarizeCohortDocs(rows), [rows])

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
    router.push(cohortDocsDetailHref(cohortName))
  }

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
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם מחזור / מדריך / קובץ…"
            className="h-9 max-w-md flex-1 text-xs"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              טוען…
            </p>
          ) : cohorts.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              אין תיעודים בארכיון — העלו קובץ Excel ראשון
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 font-semibold">מחזור</th>
                  <th className="px-3 py-2.5 font-semibold">קבצי אקסל</th>
                  <th className="px-3 py-2.5 font-semibold">מפגשים</th>
                  <th className="px-3 py-2.5 font-semibold">תאריך אחרון</th>
                  <th className="px-3 py-2.5 font-semibold">תשלום</th>
                  <th className="px-3 py-2.5 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr
                    key={cohort.cohortName}
                    className="cursor-pointer border-t border-border hover:bg-secondary/30"
                    onClick={() =>
                      router.push(cohortDocsDetailHref(cohort.cohortName))
                    }
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        href={cohortDocsDetailHref(cohort.cohortName)}
                        className="hover:underline"
                      >
                        {cohort.cohortName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {cohort.fileCount}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {cohort.sessionCount}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {cohort.lastSessionDate || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {cohort.isPaid ? (
                        <span className="inline-block rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                          שולם
                          {cohort.paidAmount != null
                            ? ` · ${formatCurrency(cohort.paidAmount)}`
                            : null}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          לא שולם
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={cohortDocsDetailHref(cohort.cohortName)}
                        className="flex items-center justify-end gap-1 text-sm text-primary hover:underline"
                      >
                        כניסה
                        <ChevronLeft className="size-4" />
                      </Link>
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
              <span className="font-medium">התיעוד שולם (תשלום אחד לכל המפגשים)</span>
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
    </div>
  )
}
