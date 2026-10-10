"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Award, FolderArchive, RefreshCw, Search, X } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { CertificatesBulkBar } from "@/components/certificates-hub/certificates-bulk-bar"
import {
  CERT_HUB_ALL_TRAININGS,
  CERT_HUB_NO_BATCH,
  CertificatesHubSection,
  type CertificatesHubFocus,
} from "@/components/certificates-hub/certificates-hub-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  listEligibleCertificateParticipantsAction,
  updateParticipantCertStatusesAction,
} from "@/lib/certificates-hub-actions"
import { syncCertificatesFromSheetsAction } from "@/lib/actions"
import {
  CERTIFICATES_HUB_TABS,
  groupRowsBySection,
  hasPendingCertificateWork,
  normalizeBatchName,
  searchCertificatesHubRows,
  tabForCertifyingBody,
  type CertificatesHubRow,
  type CertificatesHubSearchHit,
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
  const [searchQuery, setSearchQuery] = useState("")
  const [searchHits, setSearchHits] = useState<CertificatesHubSearchHit[] | null>(
    null,
  )
  const [focus, setFocus] = useState<CertificatesHubFocus | null>(null)
  const [focusToken, setFocusToken] = useState(0)

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

  const navigateToHit = useCallback((hit: CertificatesHubSearchHit) => {
    const token = focusToken + 1
    setFocusToken(token)
    setTab(hit.tab)
    setSelectedIds(new Set())
    setSearchHits(null)
    setSearchQuery(hit.row.fullName)
    const batchName = normalizeBatchName(hit.row.batchName)
    setFocus({
      token,
      section: hit.section,
      participantId: hit.row.participantId,
      trainingTitle: (hit.row.trainingTitle || "").trim() || CERT_HUB_ALL_TRAININGS,
      batchFilter: batchName || CERT_HUB_NO_BATCH,
    })
    const tabLabel =
      CERTIFICATES_HUB_TABS.find((t) => t.id === hit.tab)?.label || hit.tab
    toast.success(
      batchName
        ? `עבר ל־${tabLabel} · מחזור «${batchName}»`
        : `עבר ל־${tabLabel} · ללא מחזור`,
    )
  }, [focusToken])

  const runSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchHits(null)
      toast.error("הזן שם מודרך או תעודת זהות")
      return
    }
    const hits = searchCertificatesHubRows(rows, q)
    if (!hits.length) {
      setSearchHits([])
      toast.error("לא נמצא מודרך תואם בזכאים לתעודות")
      return
    }
    if (hits.length === 1) {
      navigateToHit(hits[0])
      return
    }
    setSearchHits(hits)
  }, [searchQuery, rows, navigateToHit])

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
              nativeButton={false}
              className="h-9 gap-2 rounded-xl"
              render={
                <Link href="/certificates/cohort-docs">
                  <FolderArchive className="size-4" />
                  תיעוד מחזורים וקבצים
                </Link>
              }
            />
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
        <div className="relative space-y-2">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              runSearch()
            }}
          >
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (searchHits) setSearchHits(null)
                }}
                placeholder="חיפוש מודרך לפי שם או ת״ז…"
                className="h-10 rounded-xl pr-9"
                dir="rtl"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => {
                    setSearchQuery("")
                    setSearchHits(null)
                    setFocus(null)
                  }}
                  aria-label="ניקוי חיפוש"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="outline"
              className="h-10 gap-2 rounded-xl"
              disabled={loading}
            >
              <Search className="size-4" />
              חיפוש
            </Button>
          </form>

          {searchHits && searchHits.length > 1 ? (
            <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg">
              <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                נמצאו {searchHits.length} תוצאות — בחרו מודרך
              </p>
              <ul>
                {searchHits.map((hit) => {
                  const tabLabel =
                    CERTIFICATES_HUB_TABS.find((t) => t.id === hit.tab)?.label ||
                    hit.tab
                  const batch = normalizeBatchName(hit.row.batchName) || "ללא מחזור"
                  return (
                    <li key={hit.row.participantId}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 text-right last:border-0 hover:bg-secondary/50"
                        onClick={() => navigateToHit(hit)}
                      >
                        <span className="text-sm font-semibold">
                          {hit.row.fullName}
                          <span
                            className="ms-2 font-normal text-muted-foreground tabular-nums"
                            dir="ltr"
                          >
                            {hit.row.idNumber}
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {tabLabel} · {batch}
                          {hit.row.trainingTitle
                            ? ` · ${hit.row.trainingTitle}`
                            : ""}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {CERTIFICATES_HUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setSelectedIds(new Set())
                setFocus(null)
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
              key={`${tab}-${section}-${
                focus?.section === section ? `f${focus.token}` : "x"
              }`}
              section={section}
              rows={sectionRows}
              selectedIds={selectedIds}
              statusBusyId={statusBusyId}
              focus={
                focus && focus.section === section ? focus : null
              }
              onToggle={toggle}
              onToggleSection={toggleSection}
              onStatusChange={(row, kind, payload) =>
                void onStatusChange(row, kind, payload)
              }
              onRegistryChange={() => void load()}
              onCertificateUrlChange={(participantId, certificateUrl) => {
                setRows((prev) =>
                  prev.map((r) =>
                    r.participantId === participantId
                      ? {
                          ...r,
                          certificateUrl: certificateUrl || undefined,
                        }
                      : r,
                  ),
                )
              }}
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
