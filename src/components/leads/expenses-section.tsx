"use client"

import { useMemo, useState } from "react"
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
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
  collectExpenseTypeOptions,
  EXPENSE_TYPE_OTHER,
  EXPENSE_TYPE_PRESETS,
  formatCurrency,
  uid,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Expense, Lead } from "@/lib/types"

export function ExpensesSection({
  lead,
  alwaysOpen = false,
}: {
  lead: Lead
  alwaysOpen?: boolean
}) {
  const { updateLead, leads } = useApp()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [preset, setPreset] = useState<string>(EXPENSE_TYPE_PRESETS[0])
  const [otherLabel, setOtherLabel] = useState("")
  const [amount, setAmount] = useState("")
  const [hasReceipt, setHasReceipt] = useState(false)

  const total = lead.expenses.reduce((s, e) => s + e.amount, 0)

  const typeOptions = useMemo(
    () => collectExpenseTypeOptions(leads),
    [leads],
  )

  const resetForm = () => {
    setEditing(null)
    setPreset(EXPENSE_TYPE_PRESETS[0])
    setOtherLabel("")
    setAmount("")
    setHasReceipt(false)
    setFormOpen(false)
  }

  const resolveType = (): string | null => {
    if (preset === EXPENSE_TYPE_OTHER) {
      const custom = otherLabel.trim()
      if (!custom) {
        toast.error("יש לפרט את סוג ההוצאה")
        return null
      }
      return custom
    }
    return preset
  }

  const openAdd = () => {
    setEditing(null)
    setPreset(EXPENSE_TYPE_PRESETS[0])
    setOtherLabel("")
    setAmount("")
    setHasReceipt(false)
    setFormOpen(true)
  }

  const openEdit = (e: Expense) => {
    setEditing(e)
    const known = typeOptions.filter((t) => t !== EXPENSE_TYPE_OTHER)
    if (known.includes(e.type)) {
      setPreset(e.type)
      setOtherLabel("")
    } else {
      setPreset(EXPENSE_TYPE_OTHER)
      setOtherLabel(e.type)
    }
    setAmount(String(e.amount))
    setHasReceipt(Boolean(e.hasReceipt))
    setFormOpen(true)
  }

  const save = () => {
    if (!amount || Number(amount) <= 0) {
      toast.error("יש להזין סכום תקין")
      return
    }
    const type = resolveType()
    if (!type) return

    const nextExpense: Expense = {
      id: editing?.id || uid("e"),
      type,
      amount: Number(amount),
      hasReceipt,
      date: editing?.date || new Date().toISOString().slice(0, 10),
    }

    const expenses = editing
      ? lead.expenses.map((e) => (e.id === editing.id ? nextExpense : e))
      : [...lead.expenses, nextExpense]

    updateLead(lead.id, { expenses })
    toast.success(editing ? "ההוצאה עודכנה" : "ההוצאה נוספה")
    resetForm()
  }

  const remove = (id: string) => {
    updateLead(lead.id, { expenses: lead.expenses.filter((e) => e.id !== id) })
  }

  return (
    <CollapsibleSection
      title="הוצאות הדרכה"
      subtitle={total ? formatCurrency(total) : "אין הוצאות"}
      defaultOpen={alwaysOpen}
      alwaysOpen={alwaysOpen}
    >
      <div className="space-y-2">
        {lead.expenses.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 p-2.5"
          >
            <div className="flex items-center gap-2">
              <Receipt
                className={
                  "size-4 " +
                  (e.hasReceipt ? "text-success" : "text-muted-foreground")
                }
              />
              <div>
                <p className="text-sm font-medium">{e.type}</p>
                <p className="text-xs text-muted-foreground">
                  {e.hasReceipt ? "עם קבלה" : "ללא קבלה"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="me-1 text-sm font-semibold">
                {formatCurrency(e.amount)}
              </span>
              <button
                type="button"
                onClick={() => openEdit(e)}
                aria-label="עריכת הוצאה"
                title="עריכה"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(e.id)}
                aria-label="מחק הוצאה"
                title="מחיקה"
                className="flex size-8 items-center justify-center rounded-lg text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {formOpen ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="text-sm font-semibold">
            {editing ? "עריכת הוצאה" : "הוצאה חדשה"}
          </p>
          <Select
            value={preset}
            onValueChange={(v) => setPreset(v ?? EXPENSE_TYPE_PRESETS[0])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="z-[200]">
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset === EXPENSE_TYPE_OTHER && (
            <Input
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              placeholder="פירוט סוג הוצאה (יישמר לרשימה)"
            />
          )}
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="סכום בש״ח"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="receipt"
              checked={hasReceipt}
              onCheckedChange={(v) => setHasReceipt(Boolean(v))}
            />
            <Label htmlFor="receipt" className="text-sm">
              קיימת קבלה
            </Label>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={resetForm}
            >
              ביטול
            </Button>
            <Button className="flex-1" onClick={save}>
              {editing ? "שמירה" : "הוסף"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full justify-center"
          onClick={openAdd}
        >
          <Plus className="size-4" />
          הוסף הוצאה
        </Button>
      )}
    </CollapsibleSection>
  )
}
