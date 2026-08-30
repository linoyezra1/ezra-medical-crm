"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CertStatusPicker } from "@/components/certificates-hub/cert-status-picker"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  formatCertDateDisplay,
  type CertificatesHubRow,
} from "@/lib/certificates-hub"

const ALL_TRAININGS = "__all__"

export function CertificatesHubSection({
  section,
  rows,
  selectedIds,
  statusBusyId,
  onToggle,
  onToggleSection,
  onStatusChange,
  onRegistryChange,
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
}) {
  const [trainingFilter, setTrainingFilter] = useState(ALL_TRAININGS)

  const trainingOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const t = (r.trainingTitle || "").trim()
      if (t) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"))
  }, [rows])

  const filteredRows = useMemo(() => {
    if (trainingFilter === ALL_TRAININGS) return rows
    return rows.filter((r) => r.trainingTitle === trainingFilter)
  }, [rows, trainingFilter])

  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.has(r.participantId))

  const subtitle =
    trainingFilter === ALL_TRAININGS
      ? `${rows.length} מודרכים`
      : `${filteredRows.length} מתוך ${rows.length} מודרכים`

  return (
    <CollapsibleSection
      title={section}
      subtitle={subtitle}
      defaultOpen={false}
    >
      {trainingOptions.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Label className="shrink-0 text-xs text-muted-foreground">
            סינון הדרכת מקור
          </Label>
          <Select
            value={trainingFilter}
            onValueChange={(v) => setTrainingFilter(v || ALL_TRAININGS)}
          >
            <SelectTrigger className="h-8 min-w-[200px] max-w-md flex-1 text-xs">
              <SelectValue placeholder="כל ההדרכות" />
            </SelectTrigger>
            <SelectContent className="min-w-[280px] max-w-md">
              <SelectItem value={ALL_TRAININGS} className="text-right text-xs">
                כל ההדרכות ({rows.length})
              </SelectItem>
              {trainingOptions.map((t) => {
                const count = rows.filter((r) => r.trainingTitle === t).length
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

      <div className="overflow-x-auto p-2">
        {filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            אין מודרכים להדרכת מקור שנבחרה
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
    </CollapsibleSection>
  )
}
