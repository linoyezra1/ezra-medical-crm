"use client"

import { useEffect, useState } from "react"
import {
  BadgeCheck,
  CheckCheck,
  GraduationCap,
  MessageCircle,
  Pencil,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  fetchLeadParticipants,
  removeParticipant,
  setParticipantAttended,
  updateParticipantDetails,
} from "@/lib/actions"
import { whatsappLink } from "@/lib/helpers"
import { lmsParticipantWhatsAppMessage } from "@/lib/lms"
import { useApp } from "@/lib/store"
import type { Lead, Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

type LmsApiResult = {
  ok: boolean
  error?: string
  data?: {
    results: Array<{
      participantId: string
      name: string
      ok: boolean
      error?: string
      username?: string
      loginUrl?: string
      whatsappMessage?: string
    }>
    succeededCount: number
    failedCount: number
  }
}

export function ParticipantsSection({ lead }: { lead: Lead }) {
  const { setLeadParticipants, refresh, settings } = useApp()
  const [polling, setPolling] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lmsBusy, setLmsBusy] = useState<string | null>(null)
  const [editP, setEditP] = useState<Participant | null>(null)
  const [editForm, setEditForm] = useState({
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    feedback: "",
  })

  const participants = lead.participants || []
  const attendedCount = participants.filter((p) => p.attended).length
  const pendingLms = participants.filter((p) => !p.hasLmsAccess)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        setPolling(true)
        const rows = await fetchLeadParticipants(lead.id)
        if (!cancelled) setLeadParticipants(lead.id, rows)
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setPolling(false)
      }
    }
    void poll()
    const id = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [lead.id, setLeadParticipants])

  const toggleAttended = async (p: Participant, next: boolean) => {
    setLeadParticipants(
      lead.id,
      participants.map((x) => (x.id === p.id ? { ...x, attended: next } : x)),
    )
    const res = await setParticipantAttended(p.id, lead.id, next)
    if (!res.ok) {
      toast.error(res.error)
      setLeadParticipants(
        lead.id,
        participants.map((x) => (x.id === p.id ? { ...x, attended: !next } : x)),
      )
      return
    }
    if (next) toast.success("אושרה נוכחות — נוסף למאגר מודרכים")
    refresh()
  }

  const selectAll = async () => {
    for (const p of participants) {
      if (!p.attended) await toggleAttended(p, true)
    }
  }

  const remove = async (p: Participant) => {
    const res = await removeParticipant(p.id, lead.id)
    if (!res.ok) {
      toast.error("שגיאה במחיקה")
      return
    }
    setLeadParticipants(
      lead.id,
      participants.filter((x) => x.id !== p.id),
    )
    toast.success("המשתתף נמחק")
    refresh()
  }

  const openEdit = (p: Participant) => {
    setEditP(p)
    setEditForm({
      fullName: p.name,
      idNumber: p.idNumber,
      phone: p.phone || "",
      email: p.email || "",
      feedback: p.feedback || "",
    })
  }

  const saveEdit = async () => {
    if (!editP) return
    const res = await updateParticipantDetails(editP.id, lead.id, editForm)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("פרטי המשתתף עודכנו")
    setEditP(null)
    refresh()
  }

  const markLmsLocal = (ids: string[]) => {
    const set = new Set(ids)
    setLeadParticipants(
      lead.id,
      participants.map((p) =>
        set.has(p.id) ? { ...p, hasLmsAccess: true } : p,
      ),
    )
  }

  const createLmsUsers = async (ids: string[]) => {
    if (!ids.length) {
      toast.error("אין משתתפים ליצירת משתמש")
      return
    }
    setLmsBusy(ids.length === 1 ? ids[0]! : "bulk")
    try {
      const res = await fetch("/api/lms/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: ids }),
      })
      const json = (await res.json()) as LmsApiResult
      const results = json.data?.results || []

      const okIds = results.filter((r) => r.ok).map((r) => r.participantId)
      if (okIds.length) markLmsLocal(okIds)

      for (const r of results) {
        if (r.ok) {
          toast.success(
            `משתמש נוצר בהצלחה עבור ${r.name}! (שם משתמש וסיסמה: טלפון)`,
          )
          // פתיחת וואטסאפ אוטומטית ביצירה בודדת
          if (ids.length === 1 && r.whatsappMessage && r.username) {
            window.open(
              whatsappLink(r.username, r.whatsappMessage),
              "_blank",
              "noopener,noreferrer",
            )
          }
        } else {
          toast.error(
            `נכשל עבור ${r.name || "משתתף"}: ${r.error || "שגיאה לא ידועה"}`,
          )
        }
      }

      if (!results.length && !json.ok) {
        toast.error(json.error || "יצירת משתמשי LMS נכשלה")
      }

      refresh()
    } catch {
      toast.error("שגיאת רשת ביצירת משתמשי LMS")
    } finally {
      setLmsBusy(null)
    }
  }

  const openLmsWhatsApp = (p: Participant) => {
    if (!p.phone?.trim()) {
      toast.error("חסר טלפון למשתתף")
      return
    }
    const text = lmsParticipantWhatsAppMessage({
      fullName: p.name,
      loginUrl: settings.lmsLoginUrl || "",
    })
    window.open(whatsappLink(p.phone, text), "_blank", "noopener,noreferrer")
  }

  return (
    <CollapsibleSection
      title="משתתפים"
      subtitle={`${participants.length} נרשמו · ${attendedCount} נוכחים`}
      defaultOpen
      action={
        <RefreshCw
          className={cn(
            "size-3.5 text-muted-foreground",
            polling && "animate-spin text-primary",
          )}
        />
      }
    >
      {participants.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2 rounded-xl"
            onClick={selectAll}
          >
            <CheckCheck className="size-4" />
            בחר הכל (אישור נוכחות)
          </Button>
          {pendingLms.length > 0 && (
            <Button
              type="button"
              size="sm"
              className="w-full gap-2 rounded-xl"
              disabled={Boolean(lmsBusy)}
              onClick={() => void createLmsUsers(pendingLms.map((p) => p.id))}
            >
              <UserPlus className="size-4" />
              {lmsBusy === "bulk"
                ? "יוצר משתמשי LMS…"
                : "פתח משתמש LMS לכלל המשתתפים"}
            </Button>
          )}
        </div>
      )}

      {participants.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          עדיין אין משתתפים — השתמשו ב״הוסף משתתפים״
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => {
            const open = expandedId === p.id
            const busy = lmsBusy === p.id
            return (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-secondary/30"
              >
                <div className="flex items-center gap-1.5 p-2.5">
                  <Checkbox
                    checked={Boolean(p.attended)}
                    onCheckedChange={(v) => toggleAttended(p, Boolean(v))}
                    aria-label={`נוכחות ${p.name}`}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-right"
                    onClick={() => setExpandedId(open ? null : p.id)}
                  >
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {p.hasLmsAccess && (
                        <BadgeCheck
                          className="size-3.5 shrink-0 text-emerald-600"
                          aria-label="יש גישת LMS"
                        />
                      )}
                      <span className="truncate">
                        {p.name} – {p.idNumber}
                      </span>
                    </p>
                  </button>

                  {p.hasLmsAccess ? (
                    <button
                      type="button"
                      onClick={() => openLmsWhatsApp(p)}
                      className="flex size-8 items-center justify-center rounded-lg text-emerald-700"
                      aria-label="שלח פרטי LMS בוואטסאפ"
                      title="וואטסאפ LMS"
                    >
                      <MessageCircle className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(lmsBusy)}
                      onClick={() => void createLmsUsers([p.id])}
                      className="flex size-8 items-center justify-center rounded-lg text-primary disabled:opacity-50"
                      aria-label="פתח משתמש LMS"
                      title="פתח משתמש LMS"
                    >
                      {busy ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <GraduationCap className="size-3.5" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                    aria-label="עריכה"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className="flex size-8 items-center justify-center rounded-lg text-destructive"
                    aria-label="מחק"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {open && (
                  <div className="space-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    <p>טלפון: {p.phone || "—"}</p>
                    <p>דוא״ל: {p.email || "—"}</p>
                    <p>דירוג: {p.satisfaction || "—"}</p>
                    <p>משוב: {p.feedback || "—"}</p>
                    {p.attended && (
                      <p className="font-medium text-emerald-700">
                        ✓ נוכח — במאגר מודרכים
                      </p>
                    )}
                    {p.hasLmsAccess && (
                      <p className="font-medium text-emerald-700">
                        ✓ משתמש LMS פעיל (שם משתמש וסיסמה = טלפון)
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={Boolean(editP)} onOpenChange={(o) => !o && setEditP(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>עריכת משתתף</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={editForm.fullName}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, fullName: e.target.value }))
              }
              placeholder="שם מלא"
            />
            <Input
              value={editForm.idNumber}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, idNumber: e.target.value }))
              }
              placeholder="ת״ז"
              dir="ltr"
            />
            <Input
              value={editForm.phone}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, phone: e.target.value }))
              }
              placeholder="טלפון"
              dir="ltr"
            />
            <Input
              value={editForm.email}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="דוא״ל"
              dir="ltr"
            />
            <Input
              value={editForm.feedback}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, feedback: e.target.value }))
              }
              placeholder="משוב"
            />
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} className="w-full">
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleSection>
  )
}
