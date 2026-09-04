"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, Link2 } from "lucide-react"
import { toast } from "sonner"
import { CertStatusPicker } from "@/components/certificates-hub/cert-status-picker"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateParticipantCertificateUrlAction } from "@/lib/certificates-hub-actions"
import {
  formatCertDateDisplay,
  normalizeBatchName,
  type CertificatesHubRow,
} from "@/lib/certificates-hub"

const ALL_TRAININGS = "__all__"
const ALL_BATCHES = "__all__"
const NO_BATCH = "__none__"

export function CertificatesHubSection({
  section,
  rows,
  selectedIds,
  statusBusyId,
  onToggle,
  onToggleSection,
  onStatusChange,
  onRegistryChange,
  onCertificateUrlChange,
}: {
  section: string
  rows: CertificatesHubRow[]
  selectedIds: Set<string>
  statusBusyId: string | null
  onToggle: (id: string, checked: boolean) => void
  onToggleSection: (rows: CertificatesHubRow[], checked: boolean) => void
  onStatusChange: (
    row: CertificatesHubRow,
    kind: "digital" | "physical",
    payload: { status: string; isCompleted: boolean },
  ) => void
  onRegistryChange: () => void
  onCertificateUrlChange?: (
    participantId: string,
    certificateUrl: string | null,
  ) => void
}) {
  const [trainingFilter, setTrainingFilter] = useState(ALL_TRAININGS)
  const [batchFilter, setBatchFilter] = useState(ALL_BATCHES)
  const [urlEditRow, setUrlEditRow] = useState<CertificatesHubRow | null>(null)
  const [urlDraft, setUrlDraft] = useState("")
  const [urlSaving, setUrlSaving] = useState(false)

  const trainingOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const t = (r.trainingTitle || "").trim()
      if (t) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"))
  }, [rows])

  /** שורות לסינון מחזור — רק מהדרכת המקור שנבחרה (AND) */
  const rowsForBatchScope = useMemo(() => {
    if (trainingFilter === ALL_TRAININGS) return rows
    return rows.filter((r) => r.trainingTitle === trainingFilter)
  }, [rows, trainingFilter])

  const batchOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rowsForBatchScope) {
      const name = normalizeBatchName(r.batchName)
      if (!name) continue
      map.set(name, (map.get(name) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "he"))
  }, [rowsForBatchScope])

  const unbatchedCount = useMemo(
    () => rowsForBatchScope.filter((r) => !r.batchId).length,
    [rowsForBatchScope],
  )

  // מחזור שנבחר ולא קיים תחת הדרכת המקור הנוכחית — איפוס
  useEffect(() => {
    if (batchFilter === ALL_BATCHES) return
    if (batchFilter === NO_BATCH) {
      if (unbatchedCount === 0) setBatchFilter(ALL_BATCHES)
      return
    }
    if (!batchOptions.some(([name]) => name === batchFilter)) {
      setBatchFilter(ALL_BATCHES)
    }
  }, [batchFilter, batchOptions, unbatchedCount])

  const showTrainingFilter = trainingOptions.length > 1
  const showBatchFilter =
    batchOptions.length > 1 ||
    (batchOptions.length > 0 && unbatchedCount > 0)

  const filteredRows = useMemo(() => {
    let list = rows
    if (trainingFilter !== ALL_TRAININGS) {
      list = list.filter((r) => r.trainingTitle === trainingFilter)
    }
    const batchStillValid =
      batchFilter === ALL_BATCHES ||
      (batchFilter === NO_BATCH && list.some((r) => !r.batchId)) ||
      (batchFilter !== NO_BATCH &&
        list.some((r) => normalizeBatchName(r.batchName) === batchFilter))
    const activeBatch = batchStillValid ? batchFilter : ALL_BATCHES
    if (activeBatch === NO_BATCH) {
      list = list.filter((r) => !r.batchId)
    } else if (activeBatch !== ALL_BATCHES) {
      list = list.filter(
        (r) => normalizeBatchName(r.batchName) === activeBatch,
      )
    }
    return list
  }, [rows, trainingFilter, batchFilter])

  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.has(r.participantId))

  const openUrlEdit = (row: CertificatesHubRow) => {
    setUrlEditRow(row)
    setUrlDraft(row.certificateUrl?.trim() || "")
  }

  const saveUrl = async () => {
    if (!urlEditRow) return
    setUrlSaving(true)
    const res = await updateParticipantCertificateUrlAction({
      participantId: urlEditRow.participantId,
      certificateUrl: urlDraft.trim() || null,
    })
    setUrlSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    onCertificateUrlChange?.(
      urlEditRow.participantId,
      res.data.certificateUrl,
    )
    toast.success("קישור התעודה נשמר")
    setUrlEditRow(null)
  }

  const subtitle =
    trainingFilter === ALL_TRAININGS && batchFilter === ALL_BATCHES
      ? `${rows.length} מודרכים`
      : `${filteredRows.length} מתוך ${rows.length} מודרכים`

  return (
    <CollapsibleSection
      title={section}
      subtitle={subtitle}
      defaultOpen={false}
    >
      {showTrainingFilter || showBatchFilter ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
          {showTrainingFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="shrink-0 text-xs text-muted-foreground">
                סינון הדרכת מקור
              </Label>
              <Select
                value={trainingFilter}
                onValueChange={(v) => {
                  setTrainingFilter(v || ALL_TRAININGS)
                  setBatchFilter(ALL_BATCHES)
                }}
              >
                <SelectTrigger className="h-8 min-w-[200px] max-w-md flex-1 text-xs">
                  <SelectValue placeholder="כל ההדרכות" />
                </SelectTrigger>
                <SelectContent className="min-w-[280px] max-w-md">
                  <SelectItem
                    value={ALL_TRAININGS}
                    className="text-right text-xs"
                  >
                    כל ההדרכות ({rows.length})
                  </SelectItem>
                  {trainingOptions.map((t) => {
                    const count = rows.filter((r) => r.trainingTitle === t)
                      .length
                    return (
                      <SelectItem
                        key={t}
                        value={t}
                        className="break-words whitespace-normal text-right text-xs leading-snug"
                      >
                        {t} ({count})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showBatchFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="shrink-0 text-xs text-muted-foreground">
                סינון מחזור
              </Label>
              <Select
                value={batchFilter}
                onValueChange={(v) => setBatchFilter(v || ALL_BATCHES)}
              >
                <SelectTrigger className="h-8 min-w-[180px] max-w-md flex-1 text-xs">
                  <SelectValue placeholder="כל המחזורים" />
                </SelectTrigger>
                <SelectContent className="min-w-[240px] max-w-md">
                  <SelectItem value={ALL_BATCHES} className="text-right text-xs">
                    כל המחזורים ({rowsForBatchScope.length})
                  </SelectItem>
                  {unbatchedCount > 0 ? (
                    <SelectItem value={NO_BATCH} className="text-right text-xs">
                      ללא מחזור ({unbatchedCount})
                    </SelectItem>
                  ) : null}
                  {batchOptions.map(([name, count]) => (
                    <SelectItem
                      key={name}
                      value={name}
                      className="break-words whitespace-normal text-right text-xs leading-snug"
                    >
                      {name} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto p-2">
        {filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            אין מודרכים התואמים את הסינון שנבחר
          </p>
        ) : (
          <table className="w-full min-w-[880px] table-fixed text-right text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[140px]" />
              <col className="w-[140px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-2 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      onToggleSection(filteredRows, Boolean(v))
                    }
                    aria-label="בחר הכל במקטע"
                  />
                </th>
                <th className="px-2 py-2 font-semibold">שם מלא</th>
                <th className="px-2 py-2 font-semibold">קטגוריה</th>
                <th className="min-w-[220px] px-2 py-2 font-semibold">
                  הדרכת מקור
                </th>
                <th className="px-2 py-2 font-semibold">
                  תאריך סיום / מפגש אחרון
                </th>
                <th className="px-2 py-2 font-semibold">מחזור</th>
                <th className="px-2 py-2 font-semibold">תעודה דיגיטלית</th>
                <th className="px-2 py-2 font-semibold">תעודה פיזית</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.participantId}
                  className="border-t border-border hover:bg-secondary/30"
                >
                  <td className="px-2 py-2">
                    <Checkbox
                      checked={selectedIds.has(r.participantId)}
                      onCheckedChange={(v) =>
                        onToggle(r.participantId, Boolean(v))
                      }
                      aria-label={`בחירה ${r.fullName}`}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/leads/${r.leadId}`}
                        className="break-words text-primary hover:underline"
                      >
                        {r.fullName}
                      </Link>
                      {r.certificateUrl?.trim() ? (
                        <a
                          href={r.certificateUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex size-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                          title="פתח תעודה"
                          aria-label={`פתח תעודה של ${r.fullName}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="קישור תעודה"
                        aria-label={`עריכת קישור תעודה של ${r.fullName}`}
                        onClick={() => openUrlEdit(r)}
                      >
                        <Link2 className="size-3.5" />
                      </button>
                      {r.unassignedBody ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          חסר גוף מסמיך
                        </span>
                      ) : null}
                      {r.isExternal ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
                          חיצוני
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="inline-block max-w-full break-words rounded-lg bg-secondary/80 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground"
                      title={r.category}
                    >
                      {r.category}
                    </span>
                  </td>
                  <td
                    className="min-w-[220px] px-2 py-2 leading-snug break-words text-muted-foreground"
                    title={r.trainingTitle}
                  >
                    {r.trainingTitle}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    {formatCertDateDisplay(r.lastSessionDate)}
                  </td>
                  <td className="px-2 py-2">
                    {r.batchName ? (
                      <span className="inline-block max-w-full truncate rounded-lg bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200">
                        {r.batchName}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <CertStatusPicker
                      value={r.digitalCertStatus}
                      kind="digital"
                      compact
                      disabled={statusBusyId === r.participantId}
                      onRegistryChange={onRegistryChange}
                      onChange={(payload) =>
                        onStatusChange(r, "digital", payload)
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <CertStatusPicker
                      value={r.physicalCertStatus}
                      kind="physical"
                      compact
                      disabled={statusBusyId === r.participantId}
                      onRegistryChange={onRegistryChange}
                      onChange={(payload) =>
                        onStatusChange(r, "physical", payload)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog
        open={Boolean(urlEditRow)}
        onOpenChange={(open) => !open && setUrlEditRow(null)}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>קישור תעודה</DialogTitle>
            {urlEditRow ? (
              <p className="text-xs text-muted-foreground">
                {urlEditRow.fullName}
              </p>
            ) : null}
          </DialogHeader>
          <div>
            <Label className="mb-1.5 block text-sm">
              קישור תעודה (דרייב / PDF)
            </Label>
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://drive.google.com/..."
              dir="ltr"
              className="text-left"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={urlSaving}
              onClick={() => void saveUrl()}
            >
              {urlSaving ? "שומר…" : "שמירה"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={urlSaving}
              onClick={() => setUrlEditRow(null)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleSection>
  )
}
