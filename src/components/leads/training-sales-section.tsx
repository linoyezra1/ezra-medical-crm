"use client"

import { useEffect, useMemo, useState } from "react"
import { CreditCard, Link2, Minus, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
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
import {
  addTrainingSale,
  deleteTrainingSale,
  recordTrainingSalePayment,
  updateTrainingSale,
} from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import {
  PAYMENT_METHODS,
  TRAINING_SALE_PENDING_PAYMENT,
} from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { Lead, TrainingSale } from "@/lib/types"
import { cn } from "@/lib/utils"

function costOf(item: { costPrice: number; sellingPrice: number }) {
  return Number(item.costPrice) || Number(item.sellingPrice) || 0
}

function paymentMethodLabel(value?: string) {
  if (!value) return "—"
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || value
}

export function TrainingSalesSection({
  lead,
  alwaysOpen = false,
}: {
  lead: Lead
  alwaysOpen?: boolean
}) {
  const { inventory, refresh, removeLeadTrainingSale } = useApp()
  const sales = lead.trainingSales || []

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<TrainingSale | null>(null)
  const [salePrice, setSalePrice] = useState("")
  const [itemId, setItemId] = useState<string>("")
  const [qty, setQty] = useState("1")
  const [paymentMethod, setPaymentMethod] = useState<string>("bit")
  const [unpaid, setUnpaid] = useState(false)
  const [participantId, setParticipantId] = useState("")
  const [receiptIssued, setReceiptIssued] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteSaleId, setDeleteSaleId] = useState<string | null>(null)
  const [deletingSale, setDeletingSale] = useState(false)

  const [paySale, setPaySale] = useState<TrainingSale | null>(null)
  const [payMethod, setPayMethod] = useState("bit")
  const [payReceipt, setPayReceipt] = useState(false)
  const [payAmount, setPayAmount] = useState("")
  const [paySaving, setPaySaving] = useState(false)

  const selectItems = useMemo(
    () =>
      inventory.map((i) => ({
        value: i.id,
        label: i.name?.trim() || "פריט ללא שם",
      })),
    [inventory],
  )

  const paymentItems = useMemo(
    () => PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label })),
    [],
  )

  const selected = inventory.find((i) => i.id === itemId)
  const qtyNum = Math.max(1, Math.floor(Number(qty) || 1))
  const unitPrice = Number(salePrice) || 0
  const lineTotal = unitPrice * qtyNum
  const isEdit = Boolean(editingSale)

  useEffect(() => {
    if (!selected || isEdit) return
    if (selected.sellingPrice > 0) {
      setSalePrice(String(selected.sellingPrice))
    }
  }, [selected?.id, isEdit])

  const totalSale = sales.reduce(
    (s, x) => s + x.unitSellingPrice * x.quantity,
    0,
  )
  const totalCost = sales.reduce((s, x) => s + x.unitCostPrice * x.quantity, 0)
  const totalCommissions = sales.reduce(
    (s, x) => s + (x.instructorCommissionAmount || 0),
    0,
  )
  const profit = totalSale - totalCost - totalCommissions
  const pendingCount = sales.filter(
    (s) => s.paymentStatus === TRAINING_SALE_PENDING_PAYMENT,
  ).length

  const resetForm = () => {
    setEditingSale(null)
    setItemId("")
    setQty("1")
    setSalePrice("")
    setPaymentMethod("bit")
    setUnpaid(false)
    setParticipantId("")
    setReceiptIssued(false)
  }

  const openAddModal = () => {
    resetForm()
    if (sales.length) {
      setSalePrice(String(sales[sales.length - 1].unitSellingPrice ?? ""))
    }
    setModalOpen(true)
  }

  const openEditModal = (sale: TrainingSale) => {
    setEditingSale(sale)
    setItemId(sale.inventoryItemId)
    setQty(String(sale.quantity))
    setSalePrice(String(sale.unitSellingPrice))
    setPaymentMethod(sale.paymentMethod || "bit")
    setUnpaid(sale.paymentStatus === TRAINING_SALE_PENDING_PAYMENT)
    setParticipantId(sale.participantId || "")
    setReceiptIssued(Boolean(sale.receiptIssued))
    setModalOpen(true)
  }

  const openPayModal = (sale: TrainingSale) => {
    setPaySale(sale)
    setPayMethod(sale.paymentMethod || "bit")
    setPayReceipt(Boolean(sale.receiptIssued))
    setPayAmount(String(sale.unitSellingPrice * sale.quantity))
  }

  const saveSale = async () => {
    if (!itemId) {
      toast.error("יש לבחור פריט")
      return
    }
    const price = Number(salePrice)
    if (!salePrice.trim() || Number.isNaN(price) || price < 0) {
      toast.error("יש להזין עלות / סכום")
      return
    }
    if (!unpaid && !paymentMethod) {
      toast.error("יש לבחור איך שולם")
      return
    }
    setSaving(true)
    const payload = {
      unpaid,
      paymentMethod: unpaid ? null : paymentMethod,
      participantId: participantId || null,
      receiptIssued,
    }
    const res = editingSale
      ? await updateTrainingSale(editingSale.id, lead.id, {
          inventoryItemId: itemId,
          quantity: qtyNum,
          unitSellingPrice: price,
          ...payload,
        })
      : await addTrainingSale(lead.id, itemId, qtyNum, price, payload)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      editingSale
        ? "המכירה עודכנה"
        : unpaid
          ? "המכירה נוספה — נוצרה משימת מעקב גבייה"
          : "המכירה נוספה",
    )
    setModalOpen(false)
    resetForm()
    refresh()
  }

  const savePayment = async () => {
    if (!paySale) return
    if (!payMethod) {
      toast.error("יש לבחור איך שולם")
      return
    }
    setPaySaving(true)
    const totalRaw = Number(payAmount)
    const unitFromTotal =
      Number.isFinite(totalRaw) && totalRaw >= 0 && paySale.quantity > 0
        ? totalRaw / paySale.quantity
        : undefined
    const res = await recordTrainingSalePayment(paySale.id, lead.id, {
      paymentMethod: payMethod,
      receiptIssued: payReceipt,
      unitSellingPrice: unitFromTotal,
    })
    setPaySaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("תשלום על הציוד נרשם")
    setPaySale(null)
    refresh()
  }

  const confirmRemoveSale = async () => {
    if (!deleteSaleId) return
    setDeletingSale(true)
    const res = await deleteTrainingSale(deleteSaleId, lead.id)
    setDeletingSale(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("רשומת המכירה נמחקה")
    removeLeadTrainingSale(lead.id, deleteSaleId)
    setDeleteSaleId(null)
    refresh()
  }

  return (
    <CollapsibleSection
      title="מכירות ציוד בהדרכה"
      subtitle={
        sales.length
          ? `${sales.length} מכירות · רווח ${formatCurrency(profit)}${
              pendingCount ? ` · ${pendingCount} ממתינים לתשלום` : ""
            }`
          : "אין מכירות עדיין"
      }
      defaultOpen={alwaysOpen}
      alwaysOpen={alwaysOpen}
      action={
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 rounded-xl px-3"
          onClick={openAddModal}
          disabled={!inventory.length}
        >
          <Plus className="size-4" />
          הוסף מכירה
        </Button>
      }
    >
      <div className="space-y-3">
        {!inventory.length && (
          <p className="text-xs text-muted-foreground">
            אין פריטים במלאי — הוסיפו ב״ניהול מלאי״.
          </p>
        )}

        {sales.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-8 text-center text-sm text-muted-foreground">
            אין מכירות עדיין — לחצו ״הוסף מכירה״
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-right text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">פריט</th>
                  <th className="px-3 py-2 font-semibold">כמות</th>
                  <th className="px-3 py-2 font-semibold">מחיר יח׳</th>
                  <th className="px-3 py-2 font-semibold">תשלום</th>
                  <th className="px-3 py-2 font-semibold">סה״כ</th>
                  <th className="w-[7.5rem] px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const sale = s.unitSellingPrice * s.quantity
                  const pending =
                    s.paymentStatus === TRAINING_SALE_PENDING_PAYMENT
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">
                        <div>{s.itemName || "פריט"}</div>
                        {s.isInstructorReported &&
                          s.reportedByInstructorName && (
                            <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              🏷️ דיווח מדריך: {s.reportedByInstructorName}
                            </span>
                          )}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {s.quantity}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatCurrency(s.unitSellingPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {pending ? (
                          <span className="font-semibold text-amber-700">
                            לא שולם
                          </span>
                        ) : (
                          paymentMethodLabel(s.paymentMethod)
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold" dir="ltr">
                        {formatCurrency(sale)}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => openPayModal(s)}
                            className={cn(
                              "flex size-8 items-center justify-center rounded-lg",
                              pending
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                : "text-primary hover:bg-primary/10",
                            )}
                            aria-label={
                              pending
                                ? "רישום תשלום על ציוד"
                                : "עדכון תשלום על ציוד"
                            }
                            title={
                              pending
                                ? "רישום תשלום על ציוד"
                                : "עדכון תשלום על ציוד"
                            }
                          >
                            <CreditCard className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label="עריכת מכירה"
                            title="עריכת מכירה"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteSaleId(s.id)}
                            className="flex size-8 items-center justify-center rounded-lg text-destructive"
                            aria-label="מחק"
                            title="מחיקה"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {sales.length > 0 && (
          <div className="rounded-2xl bg-primary/5 px-3 py-2.5 text-xs">
            <p>
              סה״כ מכירות: <strong>{formatCurrency(totalSale)}</strong>
            </p>
            <p>
              סה״כ עלויות: <strong>{formatCurrency(totalCost)}</strong>
            </p>
            {totalCommissions > 0 && (
              <p>
                עמלות מדריך:{" "}
                <strong>{formatCurrency(totalCommissions)}</strong>
              </p>
            )}
            <p className="text-primary">
              רווח: <strong>{formatCurrency(profit)}</strong>
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] gap-5 rounded-2xl p-5 sm:max-w-md md:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold">
              {isEdit ? "עריכת מכירה" : "הוספת מכירה"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>פריט</Label>
              <Select
                items={selectItems}
                value={itemId || null}
                onValueChange={(v) => setItemId(v ?? "")}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="בחרו פריט מהמלאי" />
                </SelectTrigger>
                <SelectContent>
                  {selectItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <p className="text-[11px] text-muted-foreground">
                  עלות מלאי: {formatCurrency(costOf(selected))} ליחידה
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>כמות</Label>
                <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-background px-1">
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-secondary"
                    onClick={() => setQty(String(Math.max(1, qtyNum - 1)))}
                    aria-label="הקטן כמות"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span
                    className="flex-1 text-center font-semibold tabular-nums"
                    dir="ltr"
                  >
                    {qtyNum}
                  </span>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-secondary"
                    onClick={() => setQty(String(qtyNum + 1))}
                    aria-label="הגדל כמות"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>עלות / סכום (₪ ליחידה)</Label>
                <Input
                  type="number"
                  min={0}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="מחיר אחרון / ידני"
                  dir="ltr"
                  className="h-11 font-semibold"
                  required
                />
              </div>
            </div>

            {(lead.participants || []).length > 0 ? (
              <div className="space-y-1.5">
                <Label className="inline-flex items-center gap-1.5">
                  <Link2 className="size-3.5" />
                  שיוך למשתתף (אופציונלי)
                </Label>
                <Select
                  value={participantId || null}
                  onValueChange={(v) => setParticipantId(v ?? "")}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="ללא שיוך" />
                  </SelectTrigger>
                  <SelectContent>
                    {(lead.participants || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
              <Checkbox
                checked={receiptIssued}
                onCheckedChange={(v) => setReceiptIssued(Boolean(v))}
              />
              <span className="text-sm font-semibold">הופקה קבלה</span>
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
              <Checkbox
                checked={unpaid}
                onCheckedChange={(v) => setUnpaid(Boolean(v))}
              />
              <span className="text-sm font-semibold">לא שולם</span>
            </label>

            {!unpaid ? (
              <div className="space-y-1.5">
                <Label>איך שולם</Label>
                <Select
                  items={paymentItems}
                  value={paymentMethod || null}
                  onValueChange={(v) => setPaymentMethod(v ?? "")}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="בחרו אמצעי תשלום" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentItems.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                הסטטוס יסומן כממתין לתשלום וייווצר מעקב גבייה אוטומטי.
              </p>
            )}

            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">סה״כ לתשלום</p>
              <p className="text-xl font-bold text-primary">
                {formatCurrency(lineTotal)}
              </p>
            </div>

            <Button
              className="h-12 w-full rounded-2xl text-base font-bold"
              onClick={() => void saveSale()}
              disabled={saving || !inventory.length}
            >
              {saving ? "שומר…" : isEdit ? "שמירת שינויים" : "אישור והוספה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(paySale)}
        onOpenChange={(open) => {
          if (!open) setPaySale(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>רישום תשלום על ציוד</DialogTitle>
            {paySale ? (
              <p className="text-xs text-muted-foreground">
                {paySale.itemName || "פריט"} · כמות {paySale.quantity}
              </p>
            ) : null}
          </DialogHeader>
          {paySale ? (
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 block text-sm">סכום שנגבה (₪)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  dir="ltr"
                  className="h-11"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">אופן תשלום</Label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={payReceipt}
                  onCheckedChange={(v) => setPayReceipt(Boolean(v))}
                />
                הופקה קבלה
              </label>
              <DialogFooter className="flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPaySale(null)}
                >
                  ביטול
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={paySaving}
                  onClick={() => void savePayment()}
                >
                  {paySaving ? "שומר…" : "שמירת תשלום"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteSaleId)}
        onOpenChange={(open) => {
          if (!open && !deletingSale) setDeleteSaleId(null)
        }}
        description="האם אתה בטוח שברצונך למחוק פריט זה? פעולה זו תסיר את הפריט מהמערכת."
        confirmLabel="כן, מחק פריט"
        confirming={deletingSale}
        onConfirm={confirmRemoveSale}
      />
    </CollapsibleSection>
  )
}
