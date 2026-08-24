"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
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
import {
  reportInstructorTrainingSale,
  type InstructorTrainingCard,
} from "@/lib/instructor-actions"
import { formatCurrency } from "@/lib/helpers"

export function InstructorReportSaleDialog({
  open,
  onOpenChange,
  lead,
  inventory,
  commissionPct,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: InstructorTrainingCard
  inventory: Array<{ id: string; name: string; sellingPrice: number }>
  commissionPct: number
  onSuccess: () => void
}) {
  const [itemId, setItemId] = useState("")
  const [qty, setQty] = useState("1")
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)

  const qtyNum = Math.max(1, Math.floor(Number(qty) || 1))
  const unitPrice = Number(amount) || 0
  const lineTotal = unitPrice * qtyNum
  const commission = Math.round((lineTotal * commissionPct) / 100)

  const selectedItem = useMemo(
    () => inventory.find((i) => i.id === itemId),
    [inventory, itemId],
  )

  const reset = () => {
    setItemId("")
    setQty("1")
    setAmount("")
  }

  const onSelectItem = (id: string | null) => {
    const nextId = id ?? ""
    setItemId(nextId)
    const item = inventory.find((i) => i.id === nextId)
    if (item && item.sellingPrice > 0) {
      setAmount(String(item.sellingPrice))
    }
  }

  const submit = async () => {
    if (!itemId) {
      toast.error("יש לבחור פריט ציוד")
      return
    }
    if (unitPrice <= 0) {
      toast.error("יש להזין סכום מכירה")
      return
    }
    setBusy(true)
    const res = await reportInstructorTrainingSale({
      leadId: lead.id,
      inventoryItemId: itemId,
      quantity: qtyNum,
      unitSellingPrice: unitPrice,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `המכירה נרשמה · העמלה שלך: ${formatCurrency(res.data.commission)}`,
    )
    reset()
    onSuccess()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">דווח מכירת ציוד</DialogTitle>
          <p className="text-right text-xs text-muted-foreground">{lead.title}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>פריט ציוד</Label>
            {inventory.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 text-xs text-muted-foreground">
                לא הוגדרו עבורך מוצרים למכירה. פנו למנהל המערכת.
              </p>
            ) : (
              <Select
                value={itemId || undefined}
                onValueChange={onSelectItem}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="בחר פריט מורשה" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      {o.sellingPrice > 0
                        ? ` · ${formatCurrency(o.sellingPrice)}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedItem && selectedItem.sellingPrice > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                מחיר מומלץ: {formatCurrency(selectedItem.sellingPrice)} (ניתן
                לעריכה)
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>סכום המכירה בפועל (₪)</Label>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>כמות</Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-12"
                dir="ltr"
              />
            </div>
          </div>

          {lineTotal > 0 && (
            <div className="rounded-xl bg-secondary/60 p-3 text-sm">
              <p>
                סכום מכירה:{" "}
                <span className="font-bold">{formatCurrency(lineTotal)}</span>
              </p>
              <p className="mt-1 font-medium text-primary">
                עמלה שתתווסף לשכרך: {formatCurrency(commission)} (לפי{" "}
                {commissionPct}%)
              </p>
            </div>
          )}

          <Button
            type="button"
            className="h-12 w-full rounded-xl font-bold"
            disabled={busy || inventory.length === 0}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                שומר…
              </>
            ) : (
              "שלח דיווח"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
