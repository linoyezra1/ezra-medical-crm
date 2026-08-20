"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCheck, RefreshCw, Trash2 } from "lucide-react"
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
import type { Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

export function InstructorAuthTrainingParticipantsView({
  leadId,
}: {
  leadId: string
}) {
  const [loading, setLoading] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [refreshingWix, setRefreshingWix] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Participant | null>(null)

  const wixParticipants = useMemo(
    () =>
      participants.filter((p) => {
        const src = (p.source || "").trim().toLowerCase()
        return src === "wix"
      }),
    [participants],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await fetchLeadParticipants(leadId)
    setParticipants(rows)
    setLoading(false)
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshFromWix = async () => {
    setRefreshingWix(true)
    const res = await refreshWixParticipantsAction(leadId)
    setRefreshingWix(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    await load()
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

  const remove = async (p: Participant) => {
    const ok = window.confirm(`למחוק את ${p.name} מרשימת המשתתפים?`)
    if (!ok) return
    try {
      setBusyId(p.id)
      await removeParticipant(p.id, leadId)
      setParticipants((prev) => prev.filter((x) => x.id !== p.id))
      if (selected?.id === p.id) setSelected(null)
      toast.success("המשתתף נמחק")
    } catch {
      toast.error("שגיאה במחיקה")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <PageHeader title="משתתפי הדרכה" subtitle="פאנל מדריך (Wix)" />

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
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

        {loading ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            טוען…
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
                <li key={p.id}>
                  <Card className="p-3">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 text-right"
                      onClick={() => setSelected(p)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.phone || "—"} · {p.idNumber || "—"}
                        </p>
                        {p.feedback?.trim() ? (
                          <p className="mt-1 line-clamp-1 text-[11px] text-amber-800">
                            משוב: {p.feedback.trim()}
                          </p>
                        ) : null}
                      </div>

                      <span className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
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
                        onClick={() => void remove(p)}
                      >
                        <Trash2 className="size-4" />
                        מחיקה
                      </Button>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <InstructorParticipantDrawer
        participant={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </div>
  )
}

function InstructorParticipantDrawer({
  participant,
  onOpenChange,
}: {
  participant: Participant | null
  onOpenChange: (open: boolean) => void
}) {
  const p = participant
  return (
    <Sheet open={Boolean(p)} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[min(85dvh,520px)] gap-0 rounded-t-3xl p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3 text-right">
          <SheetTitle className="text-base">
            {p?.name || "פרטי מודרך"}
          </SheetTitle>
        </SheetHeader>
        {p ? (
          <div className="space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-right text-sm">
            <DetailRow label="טלפון" value={p.phone || "—"} dir="ltr" />
            <DetailRow label="ת״ז" value={p.idNumber || "—"} dir="ltr" />
            <DetailRow label="דוא״ל" value={p.email || "—"} dir="ltr" />
            {p.organizerName?.trim() ? (
              <DetailRow label="מארגן" value={p.organizerName.trim()} />
            ) : null}
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-amber-950">
              <p className="text-xs font-semibold text-amber-800">משוב</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {p.feedback?.trim() || "לא נרשם משוב"}
              </p>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({
  label,
  value,
  dir,
}: {
  label: string
  value: string
  dir?: "ltr" | "rtl"
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium" dir={dir}>
        {value}
      </p>
    </div>
  )
}
