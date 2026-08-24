"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCheck, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  fetchLeadParticipants,
  refreshWixParticipantsAction,
  removeParticipant,
  setParticipantAttended,
} from "@/lib/actions"
import { formatDateWithWeekday } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "ezra-instructor-name"

export function InstructorTrainingParticipantsView({
  token,
  leadId,
}: {
  token: string
  leadId: string
}) {
  const { leads } = useApp()
  const [ready, setReady] = useState(false)
  const [name, setName] = useState("")
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshingWix, setRefreshingWix] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Participant | null>(null)

  const lead = useMemo(() => leads.find((l) => l.id === leadId), [leads, leadId])

  useEffect(() => {
    setName(localStorage.getItem(STORAGE_KEY) || "")
    setReady(true)
  }, [])

  const isMine =
    !!lead &&
    !!name.trim() &&
    lead.instructor?.trim() === name.trim() &&
    ["closed", "pending_certificates"].includes(lead.status)

  const loadParticipants = useCallback(async () => {
    setLoading(true)
    const rows = await fetchLeadParticipants(leadId)
    setParticipants(rows)
    setLoading(false)
  }, [leadId])

  const wixParticipants = useMemo(
    () =>
      participants.filter((p) => {
        const src = (p.source || "").trim().toLowerCase()
        return src === "wix"
      }),
    [participants],
  )

  useEffect(() => {
    if (!ready || !isMine) return
    void loadParticipants()
  }, [ready, isMine, loadParticipants])

  const refreshFromWix = async () => {
    setRefreshingWix(true)
    const res = await refreshWixParticipantsAction(leadId)
    setRefreshingWix(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    await loadParticipants()
    toast.success(
      `Wix: נוספו ${res.data.added} · עודכנו ${res.data.updated} · דולגו ${res.data.skipped}`,
    )
  }

  const toggleAttendance = async (p: Participant) => {
    const next = !Boolean(p.attended)
    setBusyId(p.id)
    const res = await setParticipantAttended(p.id, leadId, next)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setParticipants((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, attended: next } : x)),
    )
    setSelected((cur) =>
      cur?.id === p.id ? { ...cur, attended: next } : cur,
    )
  }

  const deleteParticipant = async (p: Participant) => {
    const ok = window.confirm(`למחוק את ${p.name} מרשימת המשתתפים?`)
    if (!ok) return
    setBusyId(p.id)
    await removeParticipant(p.id, leadId)
    setBusyId(null)
    setParticipants((prev) => prev.filter((x) => x.id !== p.id))
    if (selected?.id === p.id) setSelected(null)
    toast.success("המשתתף נמחק")
  }

  if (!ready) return null

  if (!lead) {
    return (
      <div>
        <PageHeader title="משתתפי הדרכה" subtitle="פאנל מדריך" />
        <div className="p-4">
          <Card className="p-4 text-center text-sm text-muted-foreground">
            טוען פרטי הדרכה...
          </Card>
        </div>
      </div>
    )
  }

  if (!isMine) {
    return (
      <div>
        <PageHeader title="משתתפי הדרכה" subtitle="פאנל מדריך" />
        <div className="p-4">
          <Card className="p-4 text-center text-sm text-muted-foreground">
            אין הרשאה להדרכה זו.
          </Card>
          <Link
            href={`/instructor/${token}`}
            className="mt-3 inline-flex items-center gap-2 text-sm text-primary"
          >
            <ArrowRight className="size-4" />
            חזרה להדרכות
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="משתתפי הדרכה"
        subtitle={
          lead
            ? `${lead.name} · ${formatDateWithWeekday(lead.date)}`
            : "פאנל מדריך"
        }
      />

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/instructor/${token}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm"
          >
            <ArrowRight className="size-4" />
            חזרה
          </Link>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={refreshingWix}
            onClick={() => void refreshFromWix()}
          >
            <RefreshCw
              className={cn("size-4", (refreshingWix || loading) && "animate-spin")}
            />
            רענון מ-Wix
          </Button>
        </div>

        <Card className="p-3 text-xs text-muted-foreground">
          מוצגים רק משתתפים שמקורם ב-Wix עבור הדרכה זו ({wixParticipants.length}
          ). לחצו על שם המודרך לפתיחת פרטים.
        </Card>

        {loading && wixParticipants.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            טוען משתתפים...
          </Card>
        ) : wixParticipants.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            אין כרגע משתתפי Wix בהדרכה זו
          </Card>
        ) : (
          <ul className="space-y-2">
            {wixParticipants.map((p) => {
              const busy = busyId === p.id
              return (
                <li key={p.id} className="rounded-xl border border-border bg-card p-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-right"
                    onClick={() => setSelected(p)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.phone || "—"} · {p.idNumber || "—"}
                      </p>
                    </div>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      Wix
                    </span>
                  </button>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={p.attended ? "default" : "outline"}
                      className="h-9 flex-1 gap-1.5 rounded-xl"
                      disabled={busy}
                      onClick={() => void toggleAttendance(p)}
                    >
                      <CheckCheck className="size-4" />
                      {p.attended ? "נוכח" : "סמן נוכחות"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 rounded-xl text-destructive"
                      disabled={busy}
                      onClick={() => void deleteParticipant(p)}
                    >
                      <Trash2 className="size-4" />
                      מחיקה
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[min(85dvh,520px)] gap-0 rounded-t-3xl p-0"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-right">
            <SheetTitle className="text-base">
              {selected?.name || "פרטי מודרך"}
            </SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-right text-sm">
              <div>
                <p className="text-xs text-muted-foreground">טלפון</p>
                <p className="font-medium" dir="ltr">
                  {selected.phone || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ת״ז</p>
                <p className="font-medium" dir="ltr">
                  {selected.idNumber || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">דוא״ל</p>
                <p className="font-medium" dir="ltr">
                  {selected.email || "—"}
                </p>
              </div>
              {selected.organizerName?.trim() ? (
                <div>
                  <p className="text-xs text-muted-foreground">מארגן</p>
                  <p className="font-medium">{selected.organizerName.trim()}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
