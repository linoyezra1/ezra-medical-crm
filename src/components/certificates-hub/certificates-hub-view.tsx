"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Award, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { CertStatusPicker } from "@/components/certificates-hub/cert-status-picker"
import { CertificatesBulkBar } from "@/components/certificates-hub/certificates-bulk-bar"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  listEligibleCertificateParticipantsAction,
  updateParticipantCertStatusesAction,
} from "@/lib/certificates-hub-actions"
import {
  CERTIFICATES_HUB_TABS,
  formatCertDateDisplay,
  groupRowsBySection,
  hasPendingCertificateWork,
  tabForCertifyingBody,
  type CertificatesHubRow,
  type CertificatesHubTab,
} from "@/lib/certificates-hub"
import { cn } from "@/lib/utils"

export function CertificatesHubView() {
  const [tab, setTab] = useState<CertificatesHubTab>("ezra")
  const [rows, setRows] = useState<CertificatesHubRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listEligibleCertificateParticipantsAction()
    setLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setRows(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sections = useMemo(
    () => groupRowsBySection(rows, tab),
    [rows, tab],
  )

  const rowsById = useMemo(() => {
    const map = new Map<string, CertificatesHubRow>()
    for (const r of rows) map.set(r.participantId, r)
    return map
  }, [rows])

  const tabCount = useMemo(() => {
    const counts: Record<CertificatesHubTab, number> = {
      ezra: 0,
      nitai: 0,
      yossi: 0,
      unassigned: 0,
    }
    for (const r of rows) {
      const t = tabForCertifyingBody(r.certifyingBody) || "unassigned"
      counts[t]++
    }
    return counts
  }, [rows])

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSection = (sectionRows: CertificatesHubRow[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of sectionRows) {
        if (checked) next.add(r.participantId)
        else next.delete(r.participantId)
      }
      return next
    })
  }

  const applyLocalStatus = (
    id: string,
    patch: Partial<
      Pick<
        CertificatesHubRow,
        | "digitalCertStatus"
        | "physicalCertStatus"
        | "digitalCompleted"
        | "physicalCompleted"
      >
    >,
  ) => {
    setRows((list) =>
      list.flatMap((r) => {
        if (r.participantId !== id) return [r]
        const updated = { ...r, ...patch }
        if (
          !hasPendingCertificateWork({
            certificateEmailSent: updated.digitalCompleted,
            certificateCardPrinted: updated.physicalCompleted,
          })
        ) {
          return []
        }
        return [updated]
      }),
    )
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const onStatusChange = async (
    row: CertificatesHubRow,
    kind: "digital" | "physical",
    payload: { status: string; markCompleted: boolean },
  ) => {
    setStatusBusyId(row.participantId)
    const res = await updateParticipantCertStatusesAction({
      participantIds: [row.participantId],
      ...(kind === "digital"
        ? {
            digitalCertStatus: payload.status,
            markDigitalCompleted: payload.markCompleted || undefined,
          }
        : {
            physicalCertStatus: payload.status,
            markPhysicalCompleted: payload.markCompleted || undefined,
          }),
    })
    setStatusBusyId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    applyLocalStatus(
      row.participantId,
      kind === "digital"
        ? {
            digitalCertStatus: payload.status,
            ...(payload.markCompleted ? { digitalCompleted: true } : {}),
          }
        : {
            physicalCertStatus: payload.status,
            ...(payload.markCompleted ? { physicalCompleted: true } : {}),
          },
    )
  }

  return (
    <div className={cn("pb-28", selectedIds.size > 0 && "pb-36")}>
      <PageHeader
        title="ניהול תעודות"
        subtitle="מודול ניסיוני — ריכוז זכאים לפי גוף מסמיך ומחזורי הפקה"
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              ניסיוני
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 rounded-xl"
              onClick={() => void load()}
              aria-label="רענון"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {CERTIFICATES_HUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setSelectedIds(new Set())
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {t.label} ({tabCount[t.id]})
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            טוען זכאים לתעודות…
          </p>
        ) : sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Award className="mx-auto mb-2 size-8 opacity-40" />
            {tab === "unassigned"
              ? "אין משתתפים חיצוניים ללא גוף מסמיך — או אין זכאים בטאב זה"
              : "אין מודרכים זכאים בטאב זה (הדרכה הסתיימה/ממתינה לתעודות + נוכחות + סיום כל המחזורים)"}
          </div>
        ) : (
          sections.map(({ section, rows: sectionRows }) => {
            const allSelected = sectionRows.every((r) =>
              selectedIds.has(r.participantId),
            )
            return (
              <CollapsibleSection
                key={section}
                title={section}
                subtitle={`${sectionRows.length} מודרכים`}
                defaultOpen={false}
              >
                <div className="overflow-x-auto p-2">
                  <table className="w-full min-w-[900px] text-right text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="w-10 px-2 py-2">
                          <Checkbox
                            checked={allSelected && sectionRows.length > 0}
                            onCheckedChange={(v) =>
                              toggleSection(sectionRows, Boolean(v))
                            }
                            aria-label="בחר הכל במקטע"
                          />
                        </th>
                        <th className="px-2 py-2 font-semibold">שם מלא</th>
                        <th className="px-2 py-2 font-semibold">ת״ז</th>
                        <th className="px-2 py-2 font-semibold">הדרכת מקור</th>
                        <th className="px-2 py-2 font-semibold">
                          תאריך סיום / מפגש אחרון
                        </th>
                        <th className="px-2 py-2 font-semibold">מחזור</th>
                        <th className="px-2 py-2 font-semibold">
                          תעודה דיגיטלית
                        </th>
                        <th className="px-2 py-2 font-semibold">
                          תעודה פיזית
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionRows.map((r) => (
                        <tr
                          key={r.participantId}
                          className="border-t border-border hover:bg-secondary/30"
                        >
                          <td className="px-2 py-2">
                            <Checkbox
                              checked={selectedIds.has(r.participantId)}
                              onCheckedChange={(v) =>
                                toggle(r.participantId, Boolean(v))
                              }
                              aria-label={`בחירה ${r.fullName}`}
                            />
                          </td>
                          <td className="px-2 py-2 font-medium">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/leads/${r.leadId}`}
                                className="text-primary hover:underline"
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
                          <td
                            className="px-2 py-2 tabular-nums text-muted-foreground"
                            dir="ltr"
                          >
                            {r.idNumber}
                          </td>
                          <td
                            className="max-w-[200px] truncate px-2 py-2 text-muted-foreground"
                            title={r.trainingTitle}
                          >
                            {r.trainingTitle}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                            {formatCertDateDisplay(r.lastSessionDate)}
                          </td>
                          <td className="px-2 py-2">
                            {r.batchName ? (
                              <span className="rounded-lg bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200">
                                {r.batchName}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <CertStatusPicker
                              value={r.digitalCertStatus}
                              kind="digital"
                              disabled={statusBusyId === r.participantId}
                              onChange={(payload) =>
                                void onStatusChange(r, "digital", payload)
                              }
                            />
                          </td>
                          <td className="px-2 py-2">
                            <CertStatusPicker
                              value={r.physicalCertStatus}
                              kind="physical"
                              disabled={statusBusyId === r.participantId}
                              onChange={(payload) =>
                                void onStatusChange(r, "physical", payload)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )
          })
        )}
      </div>

      <CertificatesBulkBar
        selectedIds={selectedIds}
        rowsById={rowsById}
        onClear={() => setSelectedIds(new Set())}
        onDone={() => {
          setSelectedIds(new Set())
          void load()
        }}
      />
    </div>
  )
}
