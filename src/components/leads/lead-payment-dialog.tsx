"use client"

import { useEffect, useMemo, useState } from "react"
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
import { recordLeadPayment } from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import { ReceiptExpensePreview } from "@/components/leads/receipt-expense-preview"
import {
  PAYMENT_METHODS,
  PAYMENT_RECEIVERS,
  isLeadPaid,
} from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

type Props = {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadPaymentDialog({ lead, open, onOpenChange }: Props) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState("")
  const [form, setForm] = useState({
    paymentDate: "",
    paymentMethod: "bit",
    paymentReceivedBy: "יצחק",
    paymentReceiptIssued: false,
  })

  const externalPriced = useMemo(
    () =>
      (lead.participants || []).filter(
        (p) => p.isExternal && (p.agreedPrice || 0) > 0,
      ),
    [lead.participants],
  )

  useEffect(() => {
    if (!open) return
    setAmount(String(lead.totalPrice || 0))
    setForm({
      paymentDate:
        lead.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: lead.paymentMethod || "bit",
      paymentReceivedBy: lead.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: Boolean(lead.paymentReceiptIssued),
    })
  }, [open, lead])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const amountRaw = amount.trim()
    const parsedAmount = amountRaw === "" ? undefined : Number(amountRaw)
    if (parsedAmount != null && !Number.isFinite(parsedAmount)) {
      toast.error("סכום תשלום לא תקין")
      setSaving(false)
      return
    }
    const res = await recordLeadPayment(lead.id, {
      ...form,
      amount: parsedAmount,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התשלום נרשם — ההדרכה מסומנת כשולמה")
    refresh()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isLeadPaid(lead) ? "עדכון תשלום" : "רישום תשלום"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{lead.name}</p>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          {externalPriced.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
              {externalPriced.map((p) => (
                <p key={p.id}>
                  שים לב: מודרך {p.name} נדרש לשלם סכום נפרד של{" "}
                  {formatCurrency(p.agreedPrice || 0)} כמשתתף חיצוני.
                </p>
              ))}
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              סכום לתשלום
            </label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              ברירת מחדל: מחיר ההדרכה ({formatCurrency(lead.totalPrice || 0)})
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              תאריך התשלום
            </label>
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
              אופן התשלום
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
            <label className="mb-1.5 block text-sm font-medium">
              מי קיבל את הכסף
            </label>
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
            האם יצאה קבלה
          </label>

          <ReceiptExpensePreview
            visible={form.paymentReceiptIssued}
            paymentAmount={amount}
          />

          <DialogFooter className="-mx-0 -mb-0 border-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "שומר…" : "שמירת תשלום"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
