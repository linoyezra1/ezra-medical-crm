"use client"

import { useState } from "react"
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

export function TrainingSalesSection({ lead }: { lead: Lead }) {
  const { inventory, refresh } = useApp()
  const sales = lead.trainingSales || []
  const [itemId, setItemId] = useState<string>("")
  const [qty, setQty] = useState("1")
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    const res = await addTrainingSale(lead.id, itemId, Number(qty) || 1)
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
      defaultOpen={false}
      action={
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
          +
        </span>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_72px_auto] items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">פריט שנמכר</Label>
            <Select value={itemId} onValueChange={(v) => setItemId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחרו פריט" />
              </SelectTrigger>
              <SelectContent>
                {inventory.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} · {formatCurrency(i.sellingPrice)}
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
            מחיר: {formatCurrency(selected.sellingPrice)} · עלות:{" "}
            {formatCurrency(selected.costPrice)} · רווח ליחידה:{" "}
            {formatCurrency(selected.sellingPrice - selected.costPrice)}
          </p>
        )}

        {!inventory.length && (
          <p className="text-xs text-muted-foreground">
            אין פריטים במלאי — הוסיפו ב״ניהול ציוד״.
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
