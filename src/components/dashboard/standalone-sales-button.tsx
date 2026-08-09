"use client"

import { useEffect, useMemo, useState } from "react"
import { ShoppingBag } from "lucide-react"
import { toast } from "sonner"
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
import { addTrainingSale } from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import { PAYMENT_METHODS } from "@/lib/payment"
import { useApp } from "@/lib/store"

/** מכירה עצמאית מהדשבורד — ללא קישור להדרכה */
export function StandaloneSalesButton() {
  const { inventory, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const [itemId, setItemId] = useState("")
  const [qty, setQty] = useState("1")
  const [salePrice, setSalePrice] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("bit")
  const [unpaid, setUnpaid] = useState(false)
  const [saving, setSaving] = useState(false)

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
  const lineTotal = (Number(salePrice) || 0) * qtyNum

  useEffect(() => {
    if (!selected) return
    if (selected.sellingPrice > 0) {
      setSalePrice(String(selected.sellingPrice))
    }
  }, [selected?.id])

  const cost = selected
    ? Number(selected.costPrice) || Number(selected.sellingPrice) || 0
    : 0

  const reset = () => {
    setItemId("")
    setQty("1")
    setSalePrice("")
    setPaymentMethod("bit")
    setUnpaid(false)
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
    const res = await addTrainingSale(null, itemId, qtyNum, price, {
      unpaid,
      paymentMethod: unpaid ? null : paymentMethod,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("המכירה נרשמה")
    setOpen(false)
    reset()
    refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-xs font-medium active:scale-95 transition-transform"
      >
        <ShoppingBag className="size-6 text-primary" />
        מכירות
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] gap-5 rounded-2xl p-5 sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>מכירת ציוד</DialogTitle>
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
                  <SelectValue placeholder="בחרו פריט" />
                </SelectTrigger>
                <SelectContent>
                  {selectItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Label>עלות / סכום</Label>
                <Input
                  type="number"
                  min={0}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  dir="ltr"
                  className="h-11"
                  required
                />
              </div>
            </div>
            {selected && (
              <p className="text-[11px] text-muted-foreground">
                עלות מלאי: {formatCurrency(cost)} ליחידה
              </p>
            )}

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
            ) : null}

            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">סה״כ לתשלום</p>
              <p className="text-xl font-bold text-primary">
                {formatCurrency(lineTotal)}
              </p>
            </div>
            <Button
              className="h-12 w-full rounded-2xl text-base font-bold"
              onClick={() => void add()}
              disabled={saving}
            >
              {saving ? "שומר…" : "אישור והוספה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
