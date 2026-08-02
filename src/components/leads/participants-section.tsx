"use client"

import { useEffect, useState } from "react"
import { CheckCheck, Pencil, RefreshCw, Trash2 } from "lucide-react"
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
import { useApp } from "@/lib/store"
import type { Lead, Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ParticipantsSection({ lead }: { lead: Lead }) {
  const { setLeadParticipants, refresh } = useApp()
  const [polling, setPolling] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-3 w-full gap-2 rounded-xl"
          onClick={selectAll}
        >
          <CheckCheck className="size-4" />
          בחר הכל (אישור נוכחות)
        </Button>
      )}

      {participants.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          עדיין אין משתתפים — השתמשו ב״הוסף משתתפים״
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => {
            const open = expandedId === p.id
            return (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-secondary/30"
              >
                <div className="flex items-center gap-2 p-2.5">
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
                    <p className="truncate text-sm font-medium">
                      {p.name} – {p.idNumber}
                    </p>
                  </button>
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
