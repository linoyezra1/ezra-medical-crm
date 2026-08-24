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
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import {
  deleteInventoryItem,
  getInventoryItemSaleCount,
  upsertInventoryItem,
} from "@/lib/actions"
import { formatCurrency } from "@/lib/helpers"
import { currentStockOf } from "@/lib/inventory-stock"
import { useApp } from "@/lib/store"
import type { InventoryItem } from "@/lib/types"
import { cn } from "@/lib/utils"

function itemCost(item: InventoryItem): number {
  return Number(item.costPrice) || 0
}

function itemSell(item: InventoryItem): number {
  return Number(item.sellingPrice) || 0
}

function unitProfit(item: InventoryItem): number {
  return itemSell(item) - itemCost(item)
}

/** עלות ליחידה מחבילה — ללא עיגול */
function packageUnitCost(
  packageTotalCost: number,
  packageUnitsCount: number,
): number {
  if (!(packageTotalCost > 0) || !(packageUnitsCount > 0)) return 0
  return packageTotalCost / packageUnitsCount
}

export function EquipmentView() {
  const { inventory, setInventoryLocal, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)

  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [totalPurchased, setTotalPurchased] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [isComposite, setIsComposite] = useState(false)
  const [isPackagePurchase, setIsPackagePurchase] = useState(false)
  const [packageTotalCost, setPackageTotalCost] = useState("")
  const [packageUnitsCount, setPackageUnitsCount] = useState("")
  const [compRows, setCompRows] = useState<{ childId: string; quantity: string }[]>(
    [],
  )
  const [saving, setSaving] = useState(false)
  const [pickerQuery, setPickerQuery] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null)
  const [deleteHasSales, setDeleteHasSales] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const availableParts = useMemo(
    () => inventory.filter((i) => i.id !== editing?.id && !i.isComposite),
    [inventory, editing?.id],
  )

  const filteredParts = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return availableParts
    return availableParts.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q),
    )
  }, [availableParts, pickerQuery])

  const sortedInventory = useMemo(
    () =>
      [...inventory].sort((a, b) => {
        if (a.isComposite !== b.isComposite) return a.isComposite ? 1 : -1
        return a.name.localeCompare(b.name, "he")
      }),
    [inventory],
  )

  const resetForm = () => {
    setEditing(null)
    setName("")
    setCategory("")
    setCostPrice("")
    setSellingPrice("")
    setTotalPurchased("")
    setSupplierName("")
    setIsComposite(false)
    setIsPackagePurchase(false)
    setPackageTotalCost("")
    setPackageUnitsCount("")
    setCompRows([])
    setPickerQuery("")
  }

  const openCreate = () => {
    resetForm()
    setOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditing(item)
    setName(item.name)
    setCategory(item.category)
    setCostPrice(String(item.costPrice || ""))
    setSellingPrice(String(item.sellingPrice || ""))
    setTotalPurchased(String(item.totalPurchased || ""))
    setSupplierName(item.supplierName)
    setIsComposite(item.isComposite)
    setIsPackagePurchase(Boolean(item.isPackagePurchase) && !item.isComposite)
    setPackageTotalCost(
      item.packageTotalCost != null && item.packageTotalCost > 0
        ? String(item.packageTotalCost)
        : "",
    )
    setPackageUnitsCount(
      item.packageUnitsCount != null && item.packageUnitsCount > 0
        ? String(item.packageUnitsCount)
        : "",
    )
    setCompRows(
      item.components.map((c) => ({
        childId: c.childId,
        quantity: String(c.quantity),
      })),
    )
    setPickerQuery("")
    setOpen(true)
  }

  const syncPackageUnitCost = (
    totalRaw: string,
    unitsRaw: string,
  ) => {
    const total = Number(totalRaw)
    const units = Number(unitsRaw)
    if (!(total > 0) || !(units > 0)) return
    setCostPrice(String(packageUnitCost(total, units)))
  }

  const computedCompositeCost = useMemo(() => {
    if (!isComposite) return 0
    return compRows.reduce((s, r) => {
      const child = inventory.find((i) => i.id === r.childId)
      if (!child) return s
      return s + itemCost(child) * (Number(r.quantity) || 0)
    }, 0)
  }, [isComposite, compRows, inventory])

  const addPart = (childId: string) => {
    setCompRows((prev) => {
      const existing = prev.find((r) => r.childId === childId)
      if (existing) {
        return prev.map((r) =>
          r.childId === childId
            ? { ...r, quantity: String((Number(r.quantity) || 0) + 1) }
            : r,
        )
      }
      return [...prev, { childId, quantity: "1" }]
    })
  }

  const setPartQty = (childId: string, quantity: string) => {
    setCompRows((prev) =>
      prev.map((r) => (r.childId === childId ? { ...r, quantity } : r)),
    )
  }

  const removePart = (childId: string) => {
    setCompRows((prev) => prev.filter((r) => r.childId !== childId))
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error("יש להזין שם פריט")
      return
    }
    if (isComposite && compRows.filter((r) => r.childId).length === 0) {
      toast.error("יש לבחור לפחות רכיב אחד מהמלאי להרכבת התיק")
      return
    }

    const cost = isComposite
      ? computedCompositeCost
      : isPackagePurchase
        ? packageUnitCost(
            Number(packageTotalCost) || 0,
            Number(packageUnitsCount) || 0,
          ) || Number(costPrice) || 0
        : Number(costPrice) || 0

    if (isPackagePurchase) {
      const total = Number(packageTotalCost) || 0
      const units = Number(packageUnitsCount) || 0
      if (!(total > 0) || !(units >= 1)) {
        toast.error("יש להזין עלות חבילה וכמות יחידות (לפחות 1)")
        return
      }
    }

    setSaving(true)
    const res = await upsertInventoryItem({
      id: editing?.id,
      name,
      category: category || (isComposite ? "תיקים" : ""),
      sellingPrice: Number(sellingPrice) || 0,
      costPrice: cost,
      supplierName,
      totalPurchased: isComposite ? 0 : Number(totalPurchased) || 0,
      isComposite,
      isPackagePurchase: !isComposite && isPackagePurchase,
      packageTotalCost: isPackagePurchase
        ? Number(packageTotalCost) || 0
        : null,
      packageUnitsCount: isPackagePurchase
        ? Number(packageUnitsCount) || 0
        : null,
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

  const requestDelete = async (item: InventoryItem) => {
    const res = await getInventoryItemSaleCount(item.id)
    setDeleteHasSales(Boolean(res.ok && res.data.count > 0))
    setDeleteTarget(item)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await deleteInventoryItem(deleteTarget.id)
    setDeleting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setInventoryLocal(inventory.filter((i) => i.id !== deleteTarget.id))
    toast.success("הפריט נמחק")
    setDeleteTarget(null)
    refresh()
  }

  return (
    <div>
      <PageHeader
        title="ניהול מלאי"
        subtitle={`${inventory.length} פריטים`}
        action={
          <Button size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="size-4" /> פריט
          </Button>
        }
      />

      <div className="p-4 md:mx-auto md:max-w-6xl md:p-6">
        {sortedInventory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            אין פריטים במלאי — הוסיפו רכיבים, ואז הרכיבו מהם תיק במידת הצורך
          </div>
        ) : (
          <>
            {/* —— Desktop table —— */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
              <table className="w-full min-w-[920px] text-right text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">שם הפריט</th>
                    <th className="px-3 py-2.5 font-semibold">כמות שהוכנסה</th>
                    <th className="px-3 py-2.5 font-semibold">כמות שנמכרה</th>
                    <th className="px-3 py-2.5 font-semibold">כמה נשאר במלאי</th>
                    <th className="px-3 py-2.5 font-semibold">עלות</th>
                    <th className="px-3 py-2.5 font-semibold">מחיר מכירה</th>
                    <th className="px-3 py-2.5 font-semibold">רווח ליחידה</th>
                    <th className="w-12 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedInventory.map((item) => {
                    const stock = currentStockOf(item)
                    const profit = unitProfit(item)
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-border hover:bg-secondary/30"
                      >
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="text-right font-semibold text-primary hover:underline"
                          >
                            {item.name}
                          </button>
                          {item.isComposite ? (
                            <span className="ms-2 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                              תיק מורכב
                            </span>
                          ) : null}
                          {item.category ? (
                            <p className="text-[11px] text-muted-foreground">
                              {item.category}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {item.isComposite ? "—" : item.totalPurchased}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {item.isComposite ? "—" : item.totalSold}
                        </td>
                        <td className="px-3 py-2.5">
                          {item.isComposite ? (
                            <div className="flex flex-wrap gap-1">
                              {item.components.length === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                item.components.map((c) => (
                                  <span
                                    key={c.childId}
                                    className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium"
                                  >
                                    {c.childName}×{c.quantity}
                                  </span>
                                ))
                              )}
                            </div>
                          ) : (
                            <span
                              className={cn(
                                "font-semibold tabular-nums",
                                stock <= 0 && "text-red-600",
                              )}
                            >
                              {stock}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {formatCurrency(itemCost(item))}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {formatCurrency(itemSell(item))}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 tabular-nums font-semibold",
                            profit < 0 && "text-red-600",
                            profit > 0 && "text-emerald-700",
                          )}
                        >
                          {formatCurrency(profit)}
                        </td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                            aria-label="מחק"
                            onClick={() => void requestDelete(item)}
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

            {/* —— Mobile cards —— */}
            <div className="space-y-2 md:hidden">
              {sortedInventory.map((item) => {
                const stock = currentStockOf(item)
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-right"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Package className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {item.name}
                          </p>
                          {item.isComposite && (
                            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                              תיק מורכב
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          עלות {formatCurrency(itemCost(item))} · מכירה{" "}
                          {formatCurrency(itemSell(item))} · רווח{" "}
                          <span
                            className={cn(
                              "font-semibold",
                              unitProfit(item) < 0 && "text-red-600",
                              unitProfit(item) > 0 && "text-emerald-700",
                            )}
                          >
                            {formatCurrency(unitProfit(item))}
                          </span>
                        </p>
                        {item.isComposite ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {item.components.map((c) => (
                              <span
                                key={c.childId}
                                className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]"
                              >
                                {c.childName}×{c.quantity}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            הוכנס {item.totalPurchased} · נמכר {item.totalSold}{" "}
                            ·{" "}
                            <span
                              className={cn(
                                "font-bold",
                                stock <= 0 ? "text-red-600" : "text-foreground",
                              )}
                            >
                              נשאר {stock}
                            </span>
                          </p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-destructive"
                      aria-label="מחק"
                      onClick={() => void requestDelete(item)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
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
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  isComposite ? "לדוגמה: תיק עזרה ראשונה מורכב" : "שם הפריט"
                }
              />
            </Field>
            <Field label="קטגוריה / סוג">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={isComposite ? "תיקים" : "לדוגמה: תחבושות, כפפות"}
              />
            </Field>

            {!isComposite && (
              <>
                <label className="flex items-start gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-sm">
                  <Checkbox
                    checked={isPackagePurchase}
                    onCheckedChange={(v) => {
                      const next = Boolean(v)
                      setIsPackagePurchase(next)
                      if (next) {
                        syncPackageUnitCost(packageTotalCost, packageUnitsCount)
                      }
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">רכישה כחבילה / מארז</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      הזינו עלות כוללת וכמות יחידות — עלות ליחידה תחושב אוטומטית
                    </span>
                  </span>
                </label>

                {isPackagePurchase && (
                  <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:grid-cols-2">
                    <Field label="עלות כוללת לחבילה (₪)">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        dir="ltr"
                        value={packageTotalCost}
                        onChange={(e) => {
                          const v = e.target.value
                          setPackageTotalCost(v)
                          syncPackageUnitCost(v, packageUnitsCount)
                        }}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="כמות יחידות בחבילה">
                      <Input
                        type="number"
                        min={1}
                        step="1"
                        dir="ltr"
                        value={packageUnitsCount}
                        onChange={(e) => {
                          const v = e.target.value
                          setPackageUnitsCount(v)
                          syncPackageUnitCost(packageTotalCost, v)
                        }}
                        placeholder="1"
                      />
                    </Field>
                  </div>
                )}

                <Field label="עלות ליחידה">
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    dir="ltr"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    readOnly={isPackagePurchase}
                    className={
                      isPackagePurchase
                        ? "bg-secondary/50 text-muted-foreground"
                        : undefined
                    }
                    title={
                      isPackagePurchase
                        ? "מחושב אוטומטית מעלות החבילה"
                        : undefined
                    }
                  />
                  {isPackagePurchase && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      מחושב אוטומטית: עלות חבילה ÷ כמות יחידות
                    </p>
                  )}
                </Field>
                <Field label="מחיר מכירה ליחידה">
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    dir="ltr"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                  />
                </Field>
                <Field label="כמות שהוכנסה למלאי">
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={totalPurchased}
                    onChange={(e) => setTotalPurchased(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                {editing && (
                  <p className="text-[11px] text-muted-foreground">
                    נמכר עד כה: {editing.totalSold} · נשאר במלאי:{" "}
                    {currentStockOf({
                      totalPurchased: Number(totalPurchased) || 0,
                      totalSold: editing.totalSold,
                      isComposite: false,
                    })}
                  </p>
                )}
              </>
            )}

            {isComposite && (
              <Field label="מחיר מכירה לתיק">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  dir="ltr"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="מחיר מכירה ללקוח"
                />
              </Field>
            )}

            <Field label="שם ספק">
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </Field>

            <label className="flex items-start gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-sm">
              <Checkbox
                checked={isComposite}
                onCheckedChange={(v) => {
                  const next = Boolean(v)
                  setIsComposite(next)
                  if (next) {
                    setIsPackagePurchase(false)
                    if (!category.trim()) setCategory("תיקים")
                  }
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">פריט מורכב / תיק</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  הרכבה מרכיבים שכבר קיימים במלאי — מכירה מנכה את הרכיבים
                </span>
              </span>
            </label>

            {isComposite && (
              <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                <div>
                  <p className="text-sm font-bold">הרכב תיק מרכיבי המלאי</p>
                  <p className="text-[11px] text-muted-foreground">
                    בחרו פריטים מהמערכת והגדירו כמות. עלות התיק תחושב אוטומטית.
                  </p>
                </div>

                {availableParts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
                    אין עדיין רכיבים במלאי.
                    <br />
                    הוסיפו קודם פריטים פשוטים, ואז חזרו להרכיב מהם תיק.
                  </div>
                ) : (
                  <>
                    <Input
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="חיפוש רכיב במלאי…"
                      className="h-9"
                    />

                    <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-card p-2">
                      {filteredParts.map((part) => {
                        const selected = compRows.some((r) => r.childId === part.id)
                        return (
                          <li key={part.id}>
                            <button
                              type="button"
                              onClick={() => addPart(part.id)}
                              className={
                                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs transition-colors " +
                                (selected
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-secondary/60")
                              }
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {part.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  עלות {formatCurrency(itemCost(part))}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                                {selected ? "+1" : "הוסף"}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                      {filteredParts.length === 0 && (
                        <li className="py-3 text-center text-[11px] text-muted-foreground">
                          לא נמצאו רכיבים לחיפוש
                        </li>
                      )}
                    </ul>
                  </>
                )}

                {compRows.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold">רכיבים בתיק</p>
                    {compRows.map((row) => {
                      const part = inventory.find((i) => i.id === row.childId)
                      if (!part) return null
                      const line = itemCost(part) * (Number(row.quantity) || 0)
                      return (
                        <div
                          key={row.childId}
                          className="flex items-center gap-2 rounded-xl border border-border bg-card p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {part.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatCurrency(itemCost(part))} ליחידה · סה״כ{" "}
                              {formatCurrency(line)}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={row.quantity}
                            onChange={(e) =>
                              setPartQty(row.childId, e.target.value)
                            }
                            dir="ltr"
                            className="h-8 w-16 text-center"
                            aria-label="כמות"
                          />
                          <button
                            type="button"
                            onClick={() => removePart(row.childId)}
                            className="flex size-8 items-center justify-center rounded-lg text-destructive"
                            aria-label="הסר רכיב"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="rounded-xl bg-card px-3 py-2 text-xs">
                  עלות תיק מחושבת:{" "}
                  <strong>{formatCurrency(computedCompositeCost)}</strong>
                </div>
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

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null)
            setDeleteHasSales(false)
          }
        }}
        description="האם אתה בטוח שברצונך למחוק פריט זה? פעולה זו תסיר את הפריט מהמערכת."
        warning={
          deleteHasSales
            ? "שים לב: פריט זה שויך למכירות קודמות. האם אתה בטוח שברצונך למחוק פריט שנמכר?"
            : null
        }
        confirming={deleting}
        onConfirm={confirmDelete}
      />
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
