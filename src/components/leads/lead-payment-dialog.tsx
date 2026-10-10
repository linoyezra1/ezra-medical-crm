"use client"

import { useEffect, useMemo, useState } from "react"
import { Pencil, Trash2, X } from "lucide-react"
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
  deleteLeadPaymentAction,
  listLeadPaymentsAction,
  recordLeadPayment,
  updateLeadPaymentAction,
} from "@/lib/actions"
import { formatCurrency, formatDate } from "@/lib/helpers"
import { ReceiptExpensePreview } from "@/components/leads/receipt-expense-preview"
import { PAYMENT_METHODS, PAYMENT_RECEIVERS } from "@/lib/payment"
import { paymentMethodLabel } from "@/lib/payment-transactions"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

type Props = {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

type LeadPaymentRow = {
  id: string
  amount: number
  paymentDate: string
  paymentMethod: string
  paymentReceivedBy: string
  paymentReceiptIssued: boolean
}

type EditForm = {
  amount: string
  paymentDate: string
  paymentMethod: string
  paymentReceivedBy: string
  paymentReceiptIssued: boolean
  pin: string
}

const emptyEdit = (): EditForm => ({
  amount: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "bit",
  paymentReceivedBy: "יצחק",
  paymentReceiptIssued: false,
  pin: "",
})

export function LeadPaymentDialog({ lead, open, onOpenChange }: Props) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [payments, setPayments] = useState<LeadPaymentRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deletePin, setDeletePin] = useState("")
  const [deleteSaving, setDeleteSaving] = useState(false)
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

  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const expected = Number(lead.totalPrice) || 0
  const remaining = Math.max(0, expected - paidTotal)

  const reloadPayments = async () => {
    const res = await listLeadPaymentsAction(lead.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setPayments(res.data)
    const paid = res.data.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const rem = Math.max(0, (Number(lead.totalPrice) || 0) - paid)
    setAmount(rem > 0 ? String(rem) : "")
  }

  useEffect(() => {
    if (!open) return
    setEditingId(null)
    setDeleteId(null)
    setDeletePin("")
    setAmount(remaining > 0 ? String(remaining) : String(expected || ""))
    setForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: "bit",
      paymentReceivedBy: "יצחק",
      paymentReceiptIssued: false,
    })
    setLoadingPayments(true)
    const expectedNow = Number(lead.totalPrice) || 0
    void listLeadPaymentsAction(lead.id).then((res) => {
      setLoadingPayments(false)
      if (!res.ok) {
        toast.error(res.error)
        setPayments([])
        return
      }
      setPayments(res.data)
      const paid = res.data.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const rem = Math.max(0, expectedNow - paid)
      setAmount(rem > 0 ? String(rem) : "")
    })
  }, [open, lead.id, lead.totalPrice])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedAmount = Number(amount.trim())
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("יש להזין סכום תשלום")
      return
    }
    setSaving(true)
    const res = await recordLeadPayment(lead.id, {
      ...form,
      amount: parsedAmount,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התשלום נרשם")
    refresh()
    await reloadPayments()
    setAmount("")
    setForm((f) => ({
      ...f,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentReceiptIssued: false,
    }))
  }

  const startEdit = (row: LeadPaymentRow) => {
    setDeleteId(null)
    setEditingId(row.id)
    setEditForm({
      amount: String(row.amount),
      paymentDate: row.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: row.paymentMethod || "bit",
      paymentReceivedBy: row.paymentReceivedBy || "יצחק",
      paymentReceiptIssued: row.paymentReceiptIssued,
      pin: "",
    })
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    if (!editForm.pin.trim()) {
      toast.error("יש להזין קוד אימות")
      return
    }
    const parsed = Number(editForm.amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("סכום תשלום לא תקין")
      return
    }
    setEditSaving(true)
    const res = await updateLeadPaymentAction(lead.id, editingId, {
      pin: editForm.pin,
      amount: parsed,
      paymentDate: editForm.paymentDate,
      paymentMethod: editForm.paymentMethod,
      paymentReceivedBy: editForm.paymentReceivedBy,
      paymentReceiptIssued: editForm.paymentReceiptIssued,
    })
    setEditSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התשלום עודכן")
    setEditingId(null)
    refresh()
    await reloadPayments()
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    if (!deletePin.trim()) {
      toast.error("יש להזין קוד אימות")
      return
    }
    setDeleteSaving(true)
    const res = await deleteLeadPaymentAction(lead.id, deleteId, deletePin)
    setDeleteSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התשלום נמחק")
    setDeleteId(null)
    setDeletePin("")
    refresh()
    await reloadPayments()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">רישום תשלום להדרכה</DialogTitle>
          <p className="text-xs text-muted-foreground">{lead.name}</p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/60 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">מחיר ההדרכה</p>
            <p className="text-sm font-extrabold">{formatCurrency(expected)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-2 py-2">
            <p className="text-[10px] text-emerald-800">נגבה</p>
            <p className="text-sm font-extrabold text-emerald-800">
              {formatCurrency(paidTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 px-2 py-2">
            <p className="text-[10px] text-amber-900">יתרה</p>
            <p className="text-sm font-extrabold text-amber-900">
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

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

        {loadingPayments ? (
          <p className="text-xs text-muted-foreground">טוען תשלומים…</p>
        ) : payments.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
            <p className="text-sm font-semibold">תשלומים על ההדרכה</p>
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-muted-foreground">
                    <th className="px-2 py-1.5 text-right font-medium">סכום</th>
                    <th className="px-2 py-1.5 text-right font-medium">תאריך</th>
                    <th className="px-2 py-1.5 text-right font-medium">אופן</th>
                    <th className="px-2 py-1.5 text-right font-medium">מי קיבל</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-2 py-2 font-semibold tabular-nums">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {row.paymentDate ? formatDate(row.paymentDate) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {paymentMethodLabel(row.paymentMethod)}
                      </td>
                      <td className="px-2 py-2">
                        {row.paymentReceivedBy || "—"}
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label="עריכת תשלום"
                            onClick={() => startEdit(row)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                            aria-label="מחיקת תשלום"
                            onClick={() => {
                              setEditingId(null)
                              setDeleteId(row.id)
                              setDeletePin("")
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingId ? (
              <form onSubmit={saveEdit} className="space-y-2 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">עריכת תשלום</p>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                    onClick={() => setEditingId(null)}
                    aria-label="סגירת עריכה"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <PaymentFields
                  amount={editForm.amount}
                  paymentDate={editForm.paymentDate}
                  paymentMethod={editForm.paymentMethod}
                  paymentReceivedBy={editForm.paymentReceivedBy}
                  paymentReceiptIssued={editForm.paymentReceiptIssued}
                  onChange={(patch) =>
                    setEditForm((f) => ({ ...f, ...patch }))
                  }
                />
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    קוד אימות
                  </label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    value={editForm.pin}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, pin: e.target.value }))
                    }
                    dir="ltr"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={editSaving}>
                  {editSaving ? "שומר…" : "שמירת תיקון"}
                </Button>
              </form>
            ) : null}

            {deleteId ? (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-900">
                  מחיקת תשלום — נדרש קוד אימות
                </p>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  dir="ltr"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setDeleteId(null)}
                  >
                    ביטול
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteSaving}
                    onClick={() => void confirmDelete()}
                  >
                    {deleteSaving ? "מוחק…" : "מחיקה"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!editingId ? (
          <form onSubmit={onSubmit} className="space-y-3">
            {payments.length > 0 ? (
              <p className="text-xs font-medium text-muted-foreground">
                רישום תשלום נוסף
              </p>
            ) : null}
            <PaymentFields
              amount={amount}
              paymentDate={form.paymentDate}
              paymentMethod={form.paymentMethod}
              paymentReceivedBy={form.paymentReceivedBy}
              paymentReceiptIssued={form.paymentReceiptIssued}
              onChange={(patch) => {
                if (patch.amount != null) setAmount(patch.amount)
                setForm((f) => ({
                  ...f,
                  ...(patch.paymentDate != null
                    ? { paymentDate: patch.paymentDate }
                    : {}),
                  ...(patch.paymentMethod != null
                    ? { paymentMethod: patch.paymentMethod }
                    : {}),
                  ...(patch.paymentReceivedBy != null
                    ? { paymentReceivedBy: patch.paymentReceivedBy }
                    : {}),
                  ...(patch.paymentReceiptIssued != null
                    ? { paymentReceiptIssued: patch.paymentReceiptIssued }
                    : {}),
                }))
              }}
            />
            <ReceiptExpensePreview
              visible={form.paymentReceiptIssued}
              paymentAmount={amount}
            />
            <DialogFooter className="flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                סגירה
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "שומר…" : "שמירת תשלום"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PaymentFields({
  amount,
  paymentDate,
  paymentMethod,
  paymentReceivedBy,
  paymentReceiptIssued,
  onChange,
}: {
  amount: string
  paymentDate: string
  paymentMethod: string
  paymentReceivedBy: string
  paymentReceiptIssued: boolean
  onChange: (patch: {
    amount?: string
    paymentDate?: string
    paymentMethod?: string
    paymentReceivedBy?: string
    paymentReceiptIssued?: boolean
  }) => void
}) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm font-medium">סכום</label>
        <Input
          type="number"
          min={0}
          step="0.01"
          required
          value={amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          dir="ltr"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">תאריך</label>
        <Input
          type="date"
          required
          value={paymentDate}
          onChange={(e) => onChange({ paymentDate: e.target.value })}
          dir="ltr"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">אופן תשלום</label>
        <select
          required
          value={paymentMethod}
          onChange={(e) => onChange({ paymentMethod: e.target.value })}
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
          value={paymentReceivedBy}
          onChange={(e) => onChange({ paymentReceivedBy: e.target.value })}
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
          checked={paymentReceiptIssued}
          onCheckedChange={(v) =>
            onChange({ paymentReceiptIssued: Boolean(v) })
          }
        />
        האם יצאה קבלה
      </label>
    </>
  )
}
