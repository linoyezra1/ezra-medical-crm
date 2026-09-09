"use client"

import { useEffect, useState } from "react"
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
import { recordParticipantPayment } from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import { ReceiptExpensePreview } from "@/components/leads/receipt-expense-preview"
import { PAYMENT_METHODS, PAYMENT_RECEIVERS } from "@/lib/payment"
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

export function ParticipantPaymentDialog({
  leadId,
  participant,
  open,
  onOpenChange,
  fallbackPrice = 0,
}: Props) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    amount: "",
    paymentDate: "",
    paymentMethod: "bit",
    paymentReceivedBy: "יצחק",
    paymentReceiptIssued: false,
  })

  const state = participant
    ? participantPaymentState(participant, fallbackPrice)
    : null

  useEffect(() => {
    if (!open || !participant) return
    const current = participantPaymentState(participant, fallbackPrice)
    setForm({
      // ברירת מחדל — היתרה לתשלום, לא מחיר היעד
      amount: current.remaining > 0 ? String(current.remaining) : "",
      paymentDate:
        participant.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: participant.paymentMethod || "bit",
      paymentReceivedBy: participant.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: Boolean(participant.paymentReceiptIssued),
    })
  }, [open, participant, fallbackPrice])

  if (!participant || !state) return null

  const entered = Number(form.amount.trim())
  const paidAfter =
    form.amount.trim() === "" || !Number.isFinite(entered)
      ? state.paid || state.expected
      : state.paid + entered

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
        <form onSubmit={onSubmit} className="space-y-3">
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
            <label className="mb-1.5 block text-sm font-medium">אופן תשלום</label>
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
                setForm((f) => ({ ...f, paymentReceivedBy: e.target.value }))
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
      </DialogContent>
    </Dialog>
  )
}
