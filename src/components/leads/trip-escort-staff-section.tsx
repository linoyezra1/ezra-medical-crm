"use client"

import { useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Trash2, Users } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteTripEscortStaff,
  upsertTripEscortStaff,
} from "@/lib/trip-escort-actions"
import {
  calcStaffPayFromDaily,
  TRIP_ESCORT_ROLE_LABELS,
  TRIP_ESCORT_ROLES,
  tripEscortRoleLabel,
  type TripEscortRole,
  type TripEscortStaffRow,
} from "@/lib/trip-escort"
import { formatCurrency, formatDate } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

type Props = {
  lead: Lead
}

type FormState = {
  fullName: string
  phone: string
  idNumber: string
  role: TripEscortRole
  assignedSessionIds: string[]
  payMode: "total" | "daily"
  payAmount: string
  dailyRate: string
  notes: string
}

const EMPTY: FormState = {
  fullName: "",
  phone: "",
  idNumber: "",
  role: "mear",
  assignedSessionIds: [],
  payMode: "total",
  payAmount: "",
  dailyRate: "",
  notes: "",
}

function sessionLabel(
  session: NonNullable<Lead["sessions"]>[number],
  index: number,
): string {
  const date = session.date ? formatDate(session.date) : `יום ${index + 1}`
  const time = session.time || ""
  const place = session.isZoom
    ? "זום"
    : session.city || session.street || ""
  return [date, time, place].filter(Boolean).join(" · ")
}

export function TripEscortStaffSection({ lead }: Props) {
  const { refresh } = useApp()
  const [staff, setStaff] = useState<TripEscortStaffRow[]>(
    lead.tripEscortStaff || [],
  )
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TripEscortStaffRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)

  const sessions = useMemo(() => lead.sessions || [], [lead.sessions])

  useEffect(() => {
    setStaff(lead.tripEscortStaff || [])
  }, [lead.tripEscortStaff])

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY,
      assignedSessionIds: sessions
        .map((s) => s.id)
        .filter((id): id is string => Boolean(id)),
    })
    setOpen(true)
  }

  const openEdit = (row: TripEscortStaffRow) => {
    setEditing(row)
    setForm({
      fullName: row.fullName,
      phone: row.phone,
      idNumber: row.idNumber,
      role: (TRIP_ESCORT_ROLES as readonly string[]).includes(row.role)
        ? (row.role as TripEscortRole)
        : "mear",
      assignedSessionIds: row.assignedSessionIds,
      payMode: "total",
      payAmount: String(row.payAmount || ""),
      dailyRate: "",
      notes: row.notes || "",
    })
    setOpen(true)
  }

  const toggleSession = (sessionId: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      assignedSessionIds: checked
        ? [...f.assignedSessionIds, sessionId]
        : f.assignedSessionIds.filter((id) => id !== sessionId),
    }))
  }

  const resolvedPayAmount = () => {
    if (form.payMode === "daily") {
      return calcStaffPayFromDaily(
        Number(form.dailyRate) || 0,
        form.assignedSessionIds.length,
      )
    }
    return Math.max(0, Number(form.payAmount) || 0)
  }

  const onSave = async () => {
    if (!form.fullName.trim()) {
      toast.error("יש למלא שם מלא")
      return
    }
    setSaving(true)
    const res = await upsertTripEscortStaff({
      id: editing?.id,
      leadId: lead.id,
      fullName: form.fullName,
      phone: form.phone,
      idNumber: form.idNumber,
      role: form.role,
      assignedSessionIds: form.assignedSessionIds,
      payAmount: resolvedPayAmount(),
      notes: form.notes,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setStaff((prev) => {
      const next = editing
        ? prev.map((row) =>
            row.id === editing.id ? res.data.staff : row,
          )
        : [...prev, res.data.staff]
      return next
    })
    setOpen(false)
    toast.success(editing ? "המלווה עודכן" : "המלווה נוסף")
    refresh()
  }

  const onDelete = async (row: TripEscortStaffRow) => {
    if (!window.confirm(`למחוק את ${row.fullName} מהשיבוץ?`)) return
    const res = await deleteTripEscortStaff(row.id, lead.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setStaff((prev) => prev.filter((item) => item.id !== row.id))
    toast.success("המלווה הוסר")
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">עובדים / מלווים משובצים</p>
          <p className="text-xs text-muted-foreground">
            {staff.length} משובצים · התשלום מסתנכרן להוצאות כ«שכר מלווה»
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 rounded-xl"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          הוסף מלווה
        </Button>
      </div>

      {staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 size-8 opacity-40" />
          אין מלווים משובצים עדיין
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{row.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {tripEscortRoleLabel(row.role)}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.assignedSessionIds.length} ימי שיבוץ ·{" "}
                    {formatCurrency(row.payAmount)}
                  </p>
                  {row.notes ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="עריכה"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="מחיקה"
                    onClick={() => void onDelete(row)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editing ? "עריכת מלווה" : "הוספת מלווה"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-sm">שם מלא</Label>
              <Input
                value={form.fullName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fullName: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">טלפון</Label>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                inputMode="tel"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">תעודת זהות</Label>
              <Input
                value={form.idNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, idNumber: e.target.value }))
                }
                dir="ltr"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">תפקיד</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    role: (v as TripEscortRole) || "mear",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_ESCORT_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {TRIP_ESCORT_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">ימי שיבוץ</Label>
              {sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  אין מפגשים שמורים לטיול — יש להוסיף ימים בטופס העריכה
                </p>
              ) : (
                <div className="space-y-2 rounded-xl border border-border p-2">
                  {sessions.map((session, index) => {
                    const id = session.id || `idx-${index}`
                    const checked = session.id
                      ? form.assignedSessionIds.includes(session.id)
                      : false
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!session.id}
                          onCheckedChange={(v) => {
                            if (!session.id) return
                            toggleSession(session.id, Boolean(v))
                          }}
                        />
                        <span>{sessionLabel(session, index)}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-1">
              <button
                type="button"
                className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                  form.payMode === "total"
                    ? "bg-card shadow-sm"
                    : "text-muted-foreground"
                }`}
                onClick={() => setForm((f) => ({ ...f, payMode: "total" }))}
              >
                סכום כולל
              </button>
              <button
                type="button"
                className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                  form.payMode === "daily"
                    ? "bg-card shadow-sm"
                    : "text-muted-foreground"
                }`}
                onClick={() => setForm((f) => ({ ...f, payMode: "daily" }))}
              >
                תעריף יומי
              </button>
            </div>
            {form.payMode === "total" ? (
              <div>
                <Label className="mb-1.5 block text-sm">תשלום כולל לעובד</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.payAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, payAmount: e.target.value }))
                  }
                />
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block text-sm">תעריף יומי</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.dailyRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dailyRate: e.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  סה״כ מחושב:{" "}
                  {formatCurrency(
                    calcStaffPayFromDaily(
                      Number(form.dailyRate) || 0,
                      form.assignedSessionIds.length,
                    ),
                  )}
                </p>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block text-sm">הערות</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
