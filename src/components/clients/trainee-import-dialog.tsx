"use client"

import { useEffect, useRef, useState } from "react"
import { FileSpreadsheet, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { TrainingSelect } from "@/components/clients/training-select"
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
import { bulkImportTrainees } from "@/lib/actions"
import {
  parseTraineeImportFile,
  validateImportRow,
  type TraineeImportRow,
} from "@/lib/trainee-import"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** שיוך קבוע להדרכה הנוכחית — מסתיר בחירת הדרכה */
  lockedLeadId?: string
  /** שורות מוכנות (למשל אחרי ייבוא מטקסט) — נכנס ישירות לתצוגה מקדימה */
  initialRows?: TraineeImportRow[] | null
  title?: string
  confirmLabel?: string
  /** הסתרת בחירת קובץ כשיש שורות התחלתיות מטקסט */
  hideFilePicker?: boolean
}

export function TraineeImportDialog({
  open,
  onOpenChange,
  lockedLeadId,
  initialRows = null,
  title,
  confirmLabel,
  hideFilePicker = false,
}: Props) {
  const { refresh } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<TraineeImportRow[]>([])
  const [mappedHeaders, setMappedHeaders] = useState<string[]>([])
  const [ignoredHeaders, setIgnoredHeaders] = useState<string[]>([])
  const [defaultLeadId, setDefaultLeadId] = useState("")
  const [fileName, setFileName] = useState("")
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set())

  const reset = () => {
    setRows([])
    setMappedHeaders([])
    setIgnoredHeaders([])
    setDefaultLeadId(lockedLeadId || "")
    setFileName("")
    setSaving(false)
    setParsing(false)
    setExcludedKeys(new Set())
    if (inputRef.current) inputRef.current.value = ""
  }

  useEffect(() => {
    if (!open) return
    setDefaultLeadId(lockedLeadId || "")
    if (initialRows?.length) {
      const withLead = lockedLeadId
        ? initialRows.map((r) => ({ ...r, leadId: lockedLeadId }))
        : initialRows
      setRows(withLead)
      setExcludedKeys(new Set())
      setMappedHeaders([])
      setIgnoredHeaders([])
      setFileName("")
    }
  }, [open, initialRows, lockedLeadId])

  const handleFile = async (file: File | null) => {
    if (!file) return
    setParsing(true)
    try {
      const result = await parseTraineeImportFile(file)
      setFileName(file.name)
      const nextRows = lockedLeadId
        ? result.rows.map((r) => ({ ...r, leadId: lockedLeadId }))
        : result.rows
      setRows(nextRows)
      setExcludedKeys(new Set())
      setMappedHeaders(result.mappedHeaders)
      setIgnoredHeaders(result.ignoredHeaders)
      if (!result.rows.length) {
        toast.error("לא נמצאו שורות תקינות בקובץ")
      } else {
        toast.success(`נטענו ${result.rows.length} שורות לתצוגה מקדימה`)
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "שגיאה בקריאת הקובץ",
      )
    } finally {
      setParsing(false)
    }
  }

  const updateRow = (key: string, patch: Partial<TraineeImportRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        const { errors, warnings } = validateImportRow(next)
        next.errors = errors
        next.warnings = warnings
        return next
      }),
    )
  }

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
    setExcludedKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const toggleIncluded = (key: string, included: boolean) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev)
      if (included) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedRows = rows.filter(
    (r) => r.errors.length === 0 && !excludedKeys.has(r.key),
  )
  const blockingCount = rows.filter((r) => r.errors.length > 0).length
  const warningCount = selectedRows.filter((r) => r.warnings.length > 0).length
  const excludedCount = rows.filter(
    (r) => r.errors.length === 0 && excludedKeys.has(r.key),
  ).length

  const effectiveDefaultLead = lockedLeadId || defaultLeadId

  const onSave = async () => {
    if (!selectedRows.length) {
      toast.error("אין שורות לשמירה — סמנו לפחות משתתף אחד תקין")
      return
    }
    if (warningCount > 0) {
      toast.message("שימו לב", {
        description: `${warningCount} שורות יישמרו ללא ת״ז תקינה (אזהרה בלבד)`,
      })
    }
    setSaving(true)
    const res = await bulkImportTrainees(
      selectedRows.map((r) => ({
        fullName: r.fullName,
        idNumber: r.idNumber,
        phone: r.phone || undefined,
        email: r.email || undefined,
        organizerName: r.organizerName || undefined,
        trainingDate: r.trainingDate || undefined,
        courseType: r.courseType || undefined,
        satisfaction: r.satisfaction || undefined,
        feedback: r.feedback || undefined,
        interestedInFirstAidKit: r.interestedInFirstAidKit || undefined,
        leadId: r.leadId || lockedLeadId || undefined,
      })),
      effectiveDefaultLead || undefined,
    )
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const { created, updated, linked, skipped, errors } = res.data
    toast.success(
      `ייבוא הושלם: ${created} חדשים · ${updated} עודכנו · ${linked} שויכו` +
        (skipped ? ` · ${skipped} דולגו` : ""),
    )
    if (errors.length) {
      toast.message("חלק מהשורות נכשלו", {
        description: errors.slice(0, 3).join(" · "),
      })
    }
    refresh()
    reset()
    onOpenChange(false)
  }

  const dialogTitle =
    title ||
    (lockedLeadId
      ? "ייבוא משתתפים להדרכה"
      : "ייבוא מודרכים מאקסל / CSV")
  const saveLabel =
    confirmLabel ||
    (lockedLeadId
      ? `אשר וייבא משתתפים (${selectedRows.length})`
      : `שמירת ${selectedRows.length} מודרכים`)

  const showFileUi = !hideFilePicker

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="flex max-h-[92dvh] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl md:max-w-5xl">
        <DialogHeader className="border-b border-border px-4 py-3 pe-12 text-right">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            בדקו את התצוגה המקדימה, בטלו סימון משורות לא רצויות ואשרו ייבוא.
            חסרה ת״ז מוצגת כאזהרה בלבד — השורות עדיין יישמרו
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {showFileUi && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2 rounded-xl sm:w-auto"
                  disabled={parsing}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  {parsing ? "קורא קובץ…" : "בחירת קובץ XLSX / CSV"}
                </Button>
                {fileName && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileSpreadsheet className="size-3.5" />
                    {fileName}
                  </p>
                )}
              </div>
              {!lockedLeadId && (
                <div className="w-full sm:max-w-sm">
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    שיוך ברירת מחדל להדרכה (אופציונלי)
                  </label>
                  <TrainingSelect
                    value={defaultLeadId}
                    onChange={setDefaultLeadId}
                    optional
                  />
                </div>
              )}
            </div>
          )}

          {(mappedHeaders.length > 0 || ignoredHeaders.length > 0) && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs">
              {mappedHeaders.length > 0 && (
                <p className="font-medium text-foreground">
                  עמודות שמופו:{" "}
                  <span className="font-normal text-muted-foreground">
                    {mappedHeaders.join(" · ")}
                  </span>
                </p>
              )}
              {ignoredHeaders.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  עמודות שהתעלמנו מהן: {ignoredHeaders.join(" · ")}
                </p>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold">
                  {rows.length} שורות
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                  {selectedRows.length} לייבוא
                </span>
                {excludedCount > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                    {excludedCount} לא מסומנות
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
                    {warningCount} עם אזהרות (יישמרו)
                  </span>
                )}
                {blockingCount > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive">
                    {blockingCount} חסומות (חסר שם)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[900px] text-right text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground">
                    <tr>
                      <th className="w-10 px-2 py-2 font-semibold">ייבא</th>
                      <th className="px-2 py-2 font-semibold">שם</th>
                      <th className="px-2 py-2 font-semibold">ת״ז</th>
                      <th className="px-2 py-2 font-semibold">טלפון</th>
                      <th className="px-2 py-2 font-semibold">אימייל</th>
                      {!lockedLeadId && (
                        <>
                          <th className="px-2 py-2 font-semibold">מארגן</th>
                          <th className="px-2 py-2 font-semibold">תאריך</th>
                          <th className="px-2 py-2 font-semibold">שיוך</th>
                        </>
                      )}
                      <th className="px-2 py-2 font-semibold">סטטוס</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const included = !excludedKeys.has(r.key)
                      const blocked = r.errors.length > 0
                      return (
                        <tr
                          key={r.key}
                          className={cn(
                            "border-t border-border",
                            blocked && "bg-destructive/5",
                            !blocked &&
                              !included &&
                              "bg-muted/40 opacity-60",
                            !blocked &&
                              included &&
                              r.warnings.length > 0 &&
                              "bg-amber-50/80",
                          )}
                        >
                          <td className="px-2 py-1.5">
                            <Checkbox
                              checked={included && !blocked}
                              disabled={blocked}
                              onCheckedChange={(v) =>
                                toggleIncluded(r.key, Boolean(v))
                              }
                              aria-label={`ייבא את ${r.fullName || "שורה"}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={r.fullName}
                              onChange={(e) =>
                                updateRow(r.key, { fullName: e.target.value })
                              }
                              className="h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={r.idNumber}
                              onChange={(e) =>
                                updateRow(r.key, { idNumber: e.target.value })
                              }
                              className="h-8 text-xs"
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={r.phone}
                              onChange={(e) =>
                                updateRow(r.key, { phone: e.target.value })
                              }
                              className="h-8 text-xs"
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={r.email}
                              onChange={(e) =>
                                updateRow(r.key, { email: e.target.value })
                              }
                              className="h-8 text-xs"
                              dir="ltr"
                            />
                          </td>
                          {!lockedLeadId && (
                            <>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={r.organizerName}
                                  onChange={(e) =>
                                    updateRow(r.key, {
                                      organizerName: e.target.value,
                                    })
                                  }
                                  className="h-8 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={r.trainingDate}
                                  onChange={(e) =>
                                    updateRow(r.key, {
                                      trainingDate: e.target.value,
                                    })
                                  }
                                  className="h-8 text-xs"
                                  dir="ltr"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <TrainingSelect
                                  value={r.leadId}
                                  onChange={(leadId) =>
                                    updateRow(r.key, { leadId })
                                  }
                                  optional
                                  className="h-8 text-xs"
                                />
                              </td>
                            </>
                          )}
                          <td className="max-w-[140px] px-2 py-1.5 text-[10px]">
                            {r.errors.length > 0 ? (
                              <span className="text-destructive">
                                {r.errors.join(", ")}
                              </span>
                            ) : !included ? (
                              <span className="text-muted-foreground">
                                לא מסומן
                              </span>
                            ) : r.warnings.length > 0 ? (
                              <span className="text-amber-800">
                                אזהרה: {r.warnings.join(", ")}
                              </span>
                            ) : (
                              <span className="text-emerald-700">תקין</span>
                            )}
                          </td>
                          <td className="px-1 py-1.5">
                            <button
                              type="button"
                              onClick={() => removeRow(r.key)}
                              className="flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                              aria-label="מחק שורה"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            disabled={saving || !selectedRows.length}
            onClick={() => void onSave()}
          >
            {saving ? "שומר…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
