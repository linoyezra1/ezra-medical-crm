"use client"

import { useEffect, useState } from "react"
import { Pencil, X } from "lucide-react"
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
import {
  recordParticipantPayment,
  updateParticipantRecordedPayment,
} from "@/lib/actions"
import { formatCurrency, formatDate } from "@/lib/helpers"
import { ReceiptExpensePreview } from "@/components/leads/receipt-expense-preview"
import {
  PAYMENT_METHODS,
  PAYMENT_RECEIVERS,
} from "@/lib/payment"
import { paymentMethodLabel } from "@/lib/payment-transactions"
import { useApp } from "@/lib/store"
import {
  PARTICIPANT_PAYMENT_LABELS,
  participantPaymentState,
} from "@/lib/training-profit"
import type { Participant } from "@/lib/types"

type Props = {
  leadId: string
  participant: Participant | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** תעריף למשתתף של ההדרכה — מחיר היעד כשאין מחיר אישי */
  fallbackPrice?: number
}

type EditForm = {
  paidAmount: string
  agreedPrice: string
  paymentDate: string
  paymentMethod: string
  paymentReceivedBy: string
  paymentReceiptIssued: boolean
  pin: string
}

export function ParticipantPaymentDialog({
  leadId,
  participant,
  open,
  onOpenChange,
  fallbackPrice = 0,
}: Props) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [form, setForm] = useState({
    amount: "",
    paymentDate: "",
    paymentMethod: "bit",
    paymentReceivedBy: "יצחק",
    paymentReceiptIssued: false,
  })
  const [editForm, setEditForm] = useState<EditForm>({
    paidAmount: "",
    agreedPrice: "",
    paymentDate: "",
    paymentMethod: "bit",
    paymentReceivedBy: "יצחק",
    paymentReceiptIssued: false,
    pin: "",
  })

  const state = participant
    ? participantPaymentState(participant, fallbackPrice)
    : null
  const hasRecordedPayment = Boolean(state && state.paid > 0)

  useEffect(() => {
    if (!open || !participant) return
    const current = participantPaymentState(participant, fallbackPrice)
    setEditing(false)
    setForm({
      // ברירת מחדל — היתרה לתשלום, לא מחיר היעד
      amount: current.remaining > 0 ? String(current.remaining) : "",
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: participant.paymentMethod || "bit",
      paymentReceivedBy: participant.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: false,
    })
    setEditForm({
      paidAmount: current.paid > 0 ? String(current.paid) : "",
      agreedPrice:
        participant.agreedPrice != null ? String(participant.agreedPrice) : "",
      paymentDate:
        participant.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: participant.paymentMethod || "bit",
      paymentReceivedBy: participant.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: Boolean(participant.paymentReceiptIssued),
      pin: "",
    })
  }, [open, participant, fallbackPrice])

  if (!participant || !state) return null

  const entered = Number(form.amount.trim())
  const paidAfter =
    form.amount.trim() === "" || !Number.isFinite(entered)
      ? state.paid || state.expected
      : state.paid + entered

  const openEdit = () => {
    setEditForm({
      paidAmount: state.paid > 0 ? String(state.paid) : "",
      agreedPrice:
        participant.agreedPrice != null ? String(participant.agreedPrice) : "",
      paymentDate:
        participant.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: participant.paymentMethod || "bit",
      paymentReceivedBy: participant.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: Boolean(participant.paymentReceiptIssued),
      pin: "",
    })
    setEditing(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const amountRaw = form.amount.trim()
    const amount = amountRaw === "" ? undefined : Number(amountRaw)
    if (amount != null && !Number.isFinite(amount)) {
      toast.error("סכום תשלום לא תקין")
      setSaving(false)
      return
    }
    const res = await recordParticipantPayment(participant.id, leadId, {
      paymentDate: form.paymentDate,
      paymentMethod: form.paymentMethod,
      paymentReceivedBy: form.paymentReceivedBy,
      paymentReceiptIssued: form.paymentReceiptIssued,
      amount,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("תשלום למשתתף נרשם")
    refresh()
    onOpenChange(false)
  }

  const onSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    const pin = editForm.pin.trim()
    if (!pin) {
      toast.error("יש להזין קוד אימות")
      return
    }
    const paidAmount = Number(editForm.paidAmount)
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      toast.error("סכום תשלום לא תקין")
      return
    }
    const agreedRaw = editForm.agreedPrice.trim()
    const agreedPrice =
      agreedRaw === ""
        ? null
        : Number.isFinite(Number(agreedRaw))
          ? Number(agreedRaw)
          : NaN
    if (agreedRaw !== "" && !Number.isFinite(agreedPrice)) {
      toast.error("מחיר כולל לא תקין")
      return
    }

    setEditSaving(true)
    const res = await updateParticipantRecordedPayment(participant.id, leadId, {
      pin,
      paidAmount,
      paymentDate: editForm.paymentDate,
      paymentMethod: editForm.paymentMethod,
      paymentReceivedBy: editForm.paymentReceivedBy,
      paymentReceiptIssued: editForm.paymentReceiptIssued,
      agreedPrice,
    })
    setEditSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התשלום עודכן")
    setEditing(false)
    refresh()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">רישום תשלום למשתתף</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {participant.name} · {PARTICIPANT_PAYMENT_LABELS[state.status]}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/60 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">מחיר כולל</p>
            <p className="text-sm font-extrabold">
              {formatCurrency(state.expected)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-2 py-2">
            <p className="text-[10px] text-emerald-800">שולם עד כה</p>
            <p className="text-sm font-extrabold text-emerald-800">
              {formatCurrency(state.paid)}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 px-2 py-2">
            <p className="text-[10px] text-amber-900">יתרה לתשלום</p>
            <p className="text-sm font-extrabold text-amber-900">
              {formatCurrency(state.remaining)}
            </p>
          </div>
        </div>

        {hasRecordedPayment ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">תשלומים רשומים</p>
              {!editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2"
                  onClick={openEdit}
                  aria-label="עריכת תשלום רשום"
                >
                  <Pencil className="size-3.5" />
                  עריכה
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2"
                  onClick={() => setEditing(false)}
                >
                  <X className="size-3.5" />
                  ביטול עריכה
                </Button>
              )}
            </div>

            {!editing ? (
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40 text-muted-foreground">
                      <th className="px-2 py-1.5 text-right font-medium">
                        סכום שנגבה
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        תאריך
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        אמצעי
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        מי קיבל
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-2 font-semibold tabular-nums">
                        {formatCurrency(state.paid)}
                        {state.expected > 0 ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            / {formatCurrency(state.expected)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {participant.paymentDate
                          ? formatDate(participant.paymentDate)
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {paymentMethodLabel(participant.paymentMethod)}
                      </td>
                      <td className="px-2 py-2">
                        {participant.paymentReceivedBy?.trim() || "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <form onSubmit={onSaveEdit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      סכום שנגבה (סה״כ)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={editForm.paidAmount}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          paidAmount: e.target.value,
                        }))
                      }
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      מחיר כולל
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editForm.agreedPrice}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          agreedPrice: e.target.value,
                        }))
                      }
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">תאריך</label>
                  <Input
                    type="date"
                    required
                    value={editForm.paymentDate}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        paymentDate: e.target.value,
                      }))
                    }
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    אופן תשלום
                  </label>
                  <select
                    required
                    value={editForm.paymentMethod}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        paymentMethod: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    מי קיבל
                  </label>
                  <select
                    required
                    value={editForm.paymentReceivedBy}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        paymentReceivedBy: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    {PAYMENT_RECEIVERS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editForm.paymentReceiptIssued}
                    onCheckedChange={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        paymentReceiptIssued: Boolean(v),
                      }))
                    }
                  />
                  הופקה קבלה
                </label>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    קוד אימות
                  </label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    placeholder="הזן קוד לאישור התיקון"
                    value={editForm.pin}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, pin: e.target.value }))
                    }
                    dir="ltr"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={editSaving}
                >
                  {editSaving ? "שומר תיקון…" : "שמירת תיקון"}
                </Button>
              </form>
            )}
          </div>
        ) : null}

        {!editing ? (
          <form onSubmit={onSubmit} className="space-y-3">
            {hasRecordedPayment ? (
              <p className="text-xs font-medium text-muted-foreground">
                רישום תשלום נוסף
              </p>
            ) : null}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                סכום התשלום הנוכחי
              </label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                dir="ltr"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {state.paid > 0
                  ? `הסכום מתווסף לתשלומים הקודמים · לאחר השמירה: ${formatCurrency(paidAfter)} מתוך ${formatCurrency(state.expected)}`
                  : `לאחר השמירה: ${formatCurrency(paidAfter)} מתוך ${formatCurrency(state.expected)}`}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">תאריך</label>
              <Input
                type="date"
                required
                value={form.paymentDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentDate: e.target.value }))
                }
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                אופן תשלום
              </label>
              <select
                required
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentMethod: e.target.value }))
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">מי קיבל</label>
              <select
                required
                value={form.paymentReceivedBy}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paymentReceivedBy: e.target.value,
                  }))
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                {PAYMENT_RECEIVERS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.paymentReceiptIssued}
                onCheckedChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    paymentReceiptIssued: Boolean(v),
                  }))
                }
              />
              הופקה קבלה
            </label>
            <ReceiptExpensePreview
              visible={form.paymentReceiptIssued}
              paymentAmount={form.amount}
            />
            <DialogFooter className="flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                ביטול
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "שומר…" : "שמירה"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
