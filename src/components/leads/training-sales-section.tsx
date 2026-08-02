"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Button } from "@/components/ui/button"
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
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

function costOf(item: { costPrice: number; sellingPrice: number }) {
  return Number(item.costPrice) || Number(item.sellingPrice) || 0
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

  const lastSalePrice = useMemo(() => {
    if (!sales.length) return ""
    const last = sales[sales.length - 1]
    return String(last.unitSellingPrice ?? "")
  }, [sales])

  const [salePrice, setSalePrice] = useState("")
  const [itemId, setItemId] = useState<string>("")
  const [qty, setQty] = useState("1")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!salePrice && lastSalePrice) setSalePrice(lastSalePrice)
  }, [lastSalePrice, salePrice])

  // בבחירת פריט — טעינת מחיר מכירה אחרון שנשמר עליו
  useEffect(() => {
    const selected = inventory.find((i) => i.id === itemId)
    if (!selected) return
    if (selected.sellingPrice > 0) {
      setSalePrice(String(selected.sellingPrice))
    }
  }, [itemId, inventory])

  const totalSale = sales.reduce(
    (s, x) => s + x.unitSellingPrice * x.quantity,
    0,
  )
  const totalCost = sales.reduce((s, x) => s + x.unitCostPrice * x.quantity, 0)
  const profit = totalSale - totalCost

  const selected = inventory.find((i) => i.id === itemId)

  const add = async () => {
    if (!itemId) {
      toast.error("יש לבחור פריט")
      return
    }
    const price = Number(salePrice)
    if (!salePrice.trim() || Number.isNaN(price) || price < 0) {
      toast.error("יש להגדיר מחיר מכירה תחת הכותרת")
      return
    }
    setSaving(true)
    const res = await addTrainingSale(lead.id, itemId, Number(qty) || 1, price)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("המכירה נוספה")
    setQty("1")
    refresh()
  }

  const remove = async (id: string) => {
    const res = await deleteTrainingSale(id, lead.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
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
    >
      <div className="space-y-3">
        {/* מחיר מכירה — מוגדר ברמת ההדרכה, ישירות מתחת לכותרת */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <Label className="text-sm font-bold text-foreground">
            מחיר מכירה
          </Label>
          <p className="mb-2 text-[11px] text-muted-foreground">
            מחיר ליחידה לכל המכירות בהדרכה זו
          </p>
          <Input
            type="number"
            min={0}
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="סכום בש״ח ליחידה"
            dir="ltr"
            className="h-11 text-base font-semibold"
          />
        </div>

        <div className="grid grid-cols-[1fr_72px_auto] items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">פריט מהמלאי</Label>
            <Select value={itemId} onValueChange={(v) => setItemId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחרו פריט" />
              </SelectTrigger>
              <SelectContent>
                {inventory.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                    {costOf(i) ? ` · עלות ${formatCurrency(costOf(i))}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">כמות</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              dir="ltr"
            />
          </div>
          <Button
            size="icon"
            className="size-10 rounded-xl"
            onClick={add}
            disabled={saving || !inventory.length}
            aria-label="הוסף מכירה"
          >
            <Plus className="size-5" />
          </Button>
        </div>

        {selected && (
          <p className="text-[11px] text-muted-foreground">
            עלות מהמלאי: {formatCurrency(costOf(selected))} ליחידה
            {salePrice.trim()
              ? ` · מכירה: ${formatCurrency(Number(salePrice) || 0)}`
              : ""}
          </p>
        )}

        {!inventory.length && (
          <p className="text-xs text-muted-foreground">
            אין פריטים במלאי — הוסיפו ב״ניהול מלאי״.
          </p>
        )}

        <ul className="space-y-2">
          {sales.map((s) => {
            const sale = s.unitSellingPrice * s.quantity
            const cost = s.unitCostPrice * s.quantity
            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-border bg-secondary/30 p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {s.itemName} × {s.quantity}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    מכירה {formatCurrency(sale)} · עלות {formatCurrency(cost)} ·
                    רווח {formatCurrency(sale - cost)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="flex size-8 items-center justify-center rounded-lg text-destructive"
                  aria-label="מחק"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>

        {sales.length > 0 && (
          <div className="rounded-xl bg-primary/5 px-3 py-2 text-xs">
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
    </CollapsibleSection>
  )
}
