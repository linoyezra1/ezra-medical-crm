"use client"

import { useEffect, useMemo, useState } from "react"
import { ShoppingBag } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { useApp } from "@/lib/store"

/** מכירה עצמאית מהדשבורד — ללא קישור להדרכה */
export function StandaloneSalesButton() {
  const { inventory, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const [itemId, setItemId] = useState("")
  const [qty, setQty] = useState("1")
  const [salePrice, setSalePrice] = useState("")
  const [saving, setSaving] = useState(false)

  const selected = inventory.find((i) => i.id === itemId)

  useEffect(() => {
    if (!selected) return
    // מחיר אחרון שנשמר על הפריט (sellingPrice)
    if (selected.sellingPrice > 0) {
      setSalePrice(String(selected.sellingPrice))
    }
  }, [selected?.id])

  const cost = selected
    ? Number(selected.costPrice) || Number(selected.sellingPrice) || 0
    : 0

  const add = async () => {
    if (!itemId) {
      toast.error("יש לבחור פריט")
      return
    }
    const price = Number(salePrice)
    if (!salePrice.trim() || Number.isNaN(price) || price < 0) {
      toast.error("יש להזין מחיר מכירה")
      return
    }
    setSaving(true)
    const res = await addTrainingSale(null, itemId, Number(qty) || 1, price)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("המכירה נרשמה")
    setOpen(false)
    setQty("1")
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>מכירת ציוד</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>פריט</Label>
              <Select value={itemId} onValueChange={(v) => setItemId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחרו פריט" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>כמות</Label>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label>מחיר מכירה</Label>
                <Input
                  type="number"
                  min={0}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            {selected && (
              <p className="text-[11px] text-muted-foreground">
                עלות מלאי: {formatCurrency(cost)}
              </p>
            )}
            <Button className="w-full" onClick={add} disabled={saving}>
              {saving ? "שומר…" : "רישום מכירה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
