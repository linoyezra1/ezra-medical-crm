"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Award, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { CertificatesBulkBar } from "@/components/certificates-hub/certificates-bulk-bar"
import { CertificatesHubSection } from "@/components/certificates-hub/certificates-hub-section"
import { Button } from "@/components/ui/button"
import {
  listEligibleCertificateParticipantsAction,
  updateParticipantCertStatusesAction,
} from "@/lib/certificates-hub-actions"
import { syncCertificatesFromSheetsAction } from "@/lib/actions"
import {
  CERTIFICATES_HUB_TABS,
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
  const [syncingSheets, setSyncingSheets] = useState(false)
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

  const syncFromSheets = async () => {
    setSyncingSheets(true)
    const res = await syncCertificatesFromSheetsAction()
    setSyncingSheets(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `סנכרון הושלם: יוצאו ${res.data.exported} חדשים · עודכנו ${res.data.updated} מודרכים` +
        (res.data.autoCompleted
          ? ` · ${res.data.autoCompleted} הדרכות הושלמו אוטומטית`
          : ""),
    )
    void load()
  }

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

  const toggleSection = (
    sectionRows: CertificatesHubRow[],
    checked: boolean,
  ) => {
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
    payload: { status: string; isCompleted: boolean },
  ) => {
    setStatusBusyId(row.participantId)
    const res = await updateParticipantCertStatusesAction({
      participantIds: [row.participantId],
      ...(kind === "digital"
        ? { digitalCertStatus: payload.status }
        : { physicalCertStatus: payload.status }),
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
            digitalCompleted: payload.isCompleted,
          }
        : {
            physicalCertStatus: payload.status,
            physicalCompleted: payload.isCompleted,
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
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-xl"
              disabled={syncingSheets || loading}
              onClick={() => void syncFromSheets()}
              title="סנכרון סטטוסי תעודות מ-Google Sheets"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  (syncingSheets || loading) && "animate-spin",
                )}
              />
              סנכרון מ-Sheets
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 rounded-xl"
              onClick={() => void load()}
              disabled={loading || syncingSheets}
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
          sections.map(({ section, rows: sectionRows }) => (
            <CertificatesHubSection
              key={`${tab}-${section}`}
              section={section}
              rows={sectionRows}
              selectedIds={selectedIds}
              statusBusyId={statusBusyId}
              onToggle={toggle}
              onToggleSection={toggleSection}
              onStatusChange={(row, kind, payload) =>
                void onStatusChange(row, kind, payload)
              }
              onRegistryChange={() => void load()}
            />
          ))
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
