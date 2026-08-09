"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
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
import { addTrainingSale, deleteTrainingSale } from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import {
  PAYMENT_METHODS,
  TRAINING_SALE_PENDING_PAYMENT,
} from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

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
  const { inventory, refresh } = useApp()
  const sales = lead.trainingSales || []

  const [modalOpen, setModalOpen] = useState(false)
  const [salePrice, setSalePrice] = useState("")
  const [itemId, setItemId] = useState<string>("")
  const [qty, setQty] = useState("1")
  const [paymentMethod, setPaymentMethod] = useState<string>("bit")
  const [unpaid, setUnpaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteSaleId, setDeleteSaleId] = useState<string | null>(null)
  const [deletingSale, setDeletingSale] = useState(false)

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

  // בבחירת פריט — טעינת מחיר מכירה אחרון שנשמר עליו
  useEffect(() => {
    if (!selected) return
    if (selected.sellingPrice > 0) {
      setSalePrice(String(selected.sellingPrice))
    }
  }, [selected?.id])

  const totalSale = sales.reduce(
    (s, x) => s + x.unitSellingPrice * x.quantity,
    0,
  )
  const totalCost = sales.reduce((s, x) => s + x.unitCostPrice * x.quantity, 0)
  const profit = totalSale - totalCost

  const resetForm = () => {
    setItemId("")
    setQty("1")
    setSalePrice("")
    setPaymentMethod("bit")
    setUnpaid(false)
  }

  const openModal = () => {
    resetForm()
    // ברירת מחדל: מחיר מהמכירה האחרונה בהדרכה (אם אין פריט נבחר)
    if (sales.length) {
      setSalePrice(String(sales[sales.length - 1].unitSellingPrice ?? ""))
    }
    setModalOpen(true)
  }

  const add = async () => {
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
    const res = await addTrainingSale(lead.id, itemId, qtyNum, price, {
      unpaid,
      paymentMethod: unpaid ? null : paymentMethod,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      unpaid ? "המכירה נוספה — נוצרה משימת מעקב גבייה" : "המכירה נוספה",
    )
    setModalOpen(false)
    resetForm()
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
    setDeleteSaleId(null)
    refresh()
  }

  return (
    <CollapsibleSection
      title="מכירות ציוד בהדרכה"
      subtitle={
        sales.length
          ? `${sales.length} מכירות · רווח ${formatCurrency(profit)}`
          : "אין מכירות עדיין"
      }
      defaultOpen={alwaysOpen}
      alwaysOpen={alwaysOpen}
      action={
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 rounded-xl px-3"
          onClick={openModal}
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
                  <th className="w-10 px-2 py-2" />
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
                        {s.itemName || "פריט"}
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
                        <button
                          type="button"
                          onClick={() => setDeleteSaleId(s.id)}
                          className="flex size-8 items-center justify-center rounded-lg text-destructive"
                          aria-label="מחק"
                        >
                          <Trash2 className="size-4" />
                        </button>
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
            <DialogTitle className="text-lg font-bold">הוספת מכירה</DialogTitle>
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
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  dir="ltr"
                  className="h-11"
                />
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
              onClick={() => void add()}
              disabled={saving || !inventory.length}
            >
              {saving ? "שומר…" : "אישור והוספה"}
            </Button>
          </div>
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
