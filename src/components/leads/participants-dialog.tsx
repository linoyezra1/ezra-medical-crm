"use client"

import { useMemo, useState } from "react"
import { GraduationCap, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
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
import { sendLmsAccessToSheets } from "@/lib/actions"
import { uid } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead, Participant } from "@/lib/types"

export function ParticipantsDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { updateLead, refresh, getLead } = useApp()
  const liveLead = getLead(lead.id) || lead
  const participants = liveLead.participants || []

  const [name, setName] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lmsBusy, setLmsBusy] = useState<string | null>(null)

  const selectedPendingLms = useMemo(
    () =>
      participants.filter((p) => selectedIds.has(p.id) && !p.hasLmsAccess),
    [participants, selectedIds],
  )

  const allSelected =
    participants.length > 0 &&
    participants.every((p) => selectedIds.has(p.id))

  const toggleSelected = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(id)
      else copy.delete(id)
      return copy
    })
  }

  const toggleSelectAll = (next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      for (const p of participants) {
        if (next) copy.add(p.id)
        else copy.delete(p.id)
      }
      return copy
    })
  }

  const add = async () => {
    const n = name.trim()
    const id = idNumber.trim()
    const ph = phone.trim()
    const em = email.trim()
    if (!n && !id && !ph && !em) {
      toast.error("יש למלא לפחות שדה אחד")
      return
    }
    const ok = await updateLead(lead.id, {
      participants: [
        ...participants,
        {
          id: uid("p"),
          name: n,
          idNumber: id,
          phone: ph || undefined,
          email: em || undefined,
        },
      ],
    })
    if (!ok) return
    setName("")
    setIdNumber("")
    setPhone("")
    setEmail("")
    toast.success("המשתתף נוסף")
    refresh()
  }

  const remove = async (p: Participant) => {
    const ok = await updateLead(lead.id, {
      participants: participants.filter((x) => x.id !== p.id),
    })
    if (!ok) return
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      copy.delete(p.id)
      return copy
    })
    toast.success("המשתתף נמחק")
    refresh()
  }

  const createLmsUsers = async (ids: string[]) => {
    if (!ids.length) {
      toast.error("אין משתתפים ליצירת משתמש")
      return
    }
    setLmsBusy(ids.length === 1 ? ids[0]! : "bulk")
    try {
      const res = await sendLmsAccessToSheets(ids)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.data.message || "פרטי הגישה למערכת הלמידה נשלחו בהצלחה!",
      )
      refresh()
    } catch {
      toast.error("שגיאת רשת בשליחת פרטי LMS")
    } finally {
      setLmsBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            הזנת משתתפים ({participants.length})
          </DialogTitle>
        </DialogHeader>

        {participants.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => toggleSelectAll(Boolean(v))}
              />
              סמן הכל
            </label>
            <Button
              type="button"
              size="sm"
              className="gap-2 rounded-xl"
              disabled={selectedIds.size === 0 || Boolean(lmsBusy)}
              onClick={() => {
                if (!selectedPendingLms.length) {
                  toast.error(
                    selectedIds.size
                      ? "לכל הנבחרים כבר יש גישת LMS"
                      : "יש לסמן משתתפים לפתיחת משתמש בלמידה",
                  )
                  return
                }
                void createLmsUsers(selectedPendingLms.map((p) => p.id))
              }}
            >
              {lmsBusy === "bulk" ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {lmsBusy === "bulk"
                ? "שולח פרטי LMS…"
                : `פתיחת משתמש בלמידה${selectedPendingLms.length ? ` (${selectedPendingLms.length})` : ""}`}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {participants.map((p) => {
            const busy = lmsBusy === p.id
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 p-2.5"
              >
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={(v) => toggleSelected(p.id, Boolean(v))}
                  aria-label={`בחירה ${p.name || p.idNumber}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.name || p.phone || p.idNumber || "ללא פרטים"}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {[p.idNumber, p.phone, p.email].filter(Boolean).join(" · ") ||
                      "—"}
                  </p>
                </div>
                {!p.hasLmsAccess ? (
                  <button
                    type="button"
                    disabled={Boolean(lmsBusy)}
                    onClick={() => void createLmsUsers([p.id])}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                    aria-label="פתח משתמש בלמידה"
                    title="פתח משתמש בלמידה"
                  >
                    {busy ? (
                      <RefreshCw className="size-3.5 animate-spin" />
                    ) : (
                      <GraduationCap className="size-3.5" />
                    )}
                    LMS
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    LMS פעיל
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  aria-label="מחק"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          })}
          {participants.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              עדיין לא הוזנו משתתפים
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">
            כל השדות אופציונליים — מספיק למלא שדה אחד (לת״ז ודוא״ל נדרשים לפתיחת LMS)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                שם (אופציונלי)
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם מלא"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                ת״ז (אופציונלי)
              </label>
              <Input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="000000000"
                inputMode="numeric"
                dir="ltr"
                className="text-right"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                טלפון (אופציונלי)
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-0000000"
                type="tel"
                dir="ltr"
                className="text-right"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                אימייל (אופציונלי)
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-stretch">
          <Button type="button" className="flex-1 gap-1.5" onClick={() => void add()}>
            <Plus className="size-4" />
            הוסף משתתף
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
