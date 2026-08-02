"use client"

import { useMemo, useState } from "react"
import { Package, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  deleteInventoryItem,
  upsertInventoryItem,
} from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { InventoryItem } from "@/lib/types"

export function EquipmentView() {
  const { inventory, setInventoryLocal, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)

  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [isComposite, setIsComposite] = useState(false)
  const [compRows, setCompRows] = useState<{ childId: string; quantity: string }[]>([
    { childId: "", quantity: "1" },
  ])
  const [saving, setSaving] = useState(false)

  const simpleItems = useMemo(
    () => inventory.filter((i) => !i.isComposite),
    [inventory],
  )

  const resetForm = () => {
    setEditing(null)
    setName("")
    setCategory("")
    setSellingPrice("")
    setCostPrice("")
    setSupplierName("")
    setIsComposite(false)
    setCompRows([{ childId: "", quantity: "1" }])
  }

  const openCreate = () => {
    resetForm()
    setOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditing(item)
    setName(item.name)
    setCategory(item.category)
    setSellingPrice(String(item.sellingPrice))
    setCostPrice(String(item.costPrice))
    setSupplierName(item.supplierName)
    setIsComposite(item.isComposite)
    setCompRows(
      item.components.length
        ? item.components.map((c) => ({
            childId: c.childId,
            quantity: String(c.quantity),
          }))
        : [{ childId: "", quantity: "1" }],
    )
    setOpen(true)
  }

  const computedCompositeCost = useMemo(() => {
    if (!isComposite) return 0
    return compRows.reduce((s, r) => {
      const child = inventory.find((i) => i.id === r.childId)
      return s + (child?.costPrice || 0) * (Number(r.quantity) || 0)
    }, 0)
  }, [isComposite, compRows, inventory])

  const save = async () => {
    if (!name.trim()) {
      toast.error("יש להזין שם פריט")
      return
    }
    setSaving(true)
    const res = await upsertInventoryItem({
      id: editing?.id,
      name,
      category,
      sellingPrice: Number(sellingPrice) || 0,
      costPrice: isComposite ? computedCompositeCost : Number(costPrice) || 0,
      supplierName,
      isComposite,
      components: isComposite
        ? compRows
            .filter((r) => r.childId)
            .map((r) => ({
              childId: r.childId,
              quantity: Number(r.quantity) || 1,
            }))
        : undefined,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(editing ? "הפריט עודכן" : "הפריט נוסף")
    setOpen(false)
    resetForm()
    refresh()
  }

  const remove = async (id: string) => {
    const res = await deleteInventoryItem(id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setInventoryLocal(inventory.filter((i) => i.id !== id))
    toast.success("הפריט נמחק")
    refresh()
  }

  return (
    <div>
      <PageHeader
        title="ניהול ציוד"
        subtitle={`${inventory.length} פריטים במלאי`}
        action={
          <Button size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="size-4" /> פריט
          </Button>
        }
      />

      <div className="space-y-2 p-4">
        {inventory.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            אין פריטי מלאי עדיין — הוסיפו פריט ראשון
          </div>
        )}
        {inventory.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openEdit(item)}
            className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-right active:scale-[0.99] transition-transform"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                {item.isComposite && (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    מורכב
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {item.category || "ללא קטגוריה"}
                {item.supplierName ? ` · ספק: ${item.supplierName}` : ""}
              </p>
              <p className="mt-1 text-xs">
                מחיר {formatCurrency(item.sellingPrice)} · עלות{" "}
                {formatCurrency(item.costPrice)} · רווח{" "}
                <span className="font-semibold text-primary">
                  {formatCurrency(item.sellingPrice - item.costPrice)}
                </span>
              </p>
              {item.isComposite && item.components.length > 0 && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  רכיבים:{" "}
                  {item.components
                    .map((c) => `${c.childName}×${c.quantity}`)
                    .join(", ")}
                </p>
              )}
            </div>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-destructive"
              aria-label="מחק"
              onClick={(e) => {
                e.stopPropagation()
                void remove(item.id)
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </button>
        ))}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) resetForm()
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>{editing ? "עריכת פריט" : "פריט מלאי חדש"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="שם הפריט">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="קטגוריה / סוג">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="לדוגמה: תיקים, ציוד מתכלה"
              />
            </Field>
            <Field label="מחיר מכירה">
              <Input
                type="number"
                dir="ltr"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
              />
            </Field>
            {!isComposite && (
              <Field label="מחיר עלות">
                <Input
                  type="number"
                  dir="ltr"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
              </Field>
            )}
            <Field label="שם ספק">
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isComposite}
                onCheckedChange={(v) => setIsComposite(Boolean(v))}
              />
              פריט מורכב (מכיל רכיבים)
            </label>

            {isComposite && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold">רכיבים</p>
                {compRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_64px] gap-2">
                    <select
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                      value={row.childId}
                      onChange={(e) => {
                        const next = [...compRows]
                        next[idx] = { ...next[idx], childId: e.target.value }
                        setCompRows(next)
                      }}
                    >
                      <option value="">בחרו רכיב</option>
                      {simpleItems
                        .filter((i) => i.id !== editing?.id)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({formatCurrency(i.costPrice)})
                          </option>
                        ))}
                    </select>
                    <Input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={row.quantity}
                      onChange={(e) => {
                        const next = [...compRows]
                        next[idx] = { ...next[idx], quantity: e.target.value }
                        setCompRows(next)
                      }}
                      dir="ltr"
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCompRows([...compRows, { childId: "", quantity: "1" }])
                  }
                >
                  + רכיב
                </Button>
                <p className="text-xs text-muted-foreground">
                  עלות מחושבת: {formatCurrency(computedCompositeCost)}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
