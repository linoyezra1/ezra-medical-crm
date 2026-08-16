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
import { PAYMENT_METHODS, PAYMENT_RECEIVERS } from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { Participant } from "@/lib/types"

type Props = {
  leadId: string
  participant: Participant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ParticipantPaymentDialog({
  leadId,
  participant,
  open,
  onOpenChange,
}: Props) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    paymentDate: "",
    paymentMethod: "bit",
    paymentReceivedBy: "יצחק",
    paymentReceiptIssued: false,
  })

  useEffect(() => {
    if (!open || !participant) return
    setForm({
      paymentDate:
        participant.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: participant.paymentMethod || "bit",
      paymentReceivedBy: participant.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: Boolean(participant.paymentReceiptIssued),
    })
  }, [open, participant])

  if (!participant) return null

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await recordParticipantPayment(participant.id, leadId, form)
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
            {participant.name}
            {participant.agreedPrice != null
              ? ` · ${formatCurrency(participant.agreedPrice)}`
              : ""}
          </p>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
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
