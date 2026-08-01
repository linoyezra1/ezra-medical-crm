"use client"

import { useState } from "react"
import { Plus, Receipt, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency, uid } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

const EXPENSE_TYPES = ["נסיעות", "ציוד מתכלה", "הדפסת תעודות", "עמלת מדריך", "אחר"]

export function ExpensesSection({ lead }: { lead: Lead }) {
  const { updateLead } = useApp()
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState(EXPENSE_TYPES[0])
  const [amount, setAmount] = useState("")
  const [hasReceipt, setHasReceipt] = useState(false)

  const total = lead.expenses.reduce((s, e) => s + e.amount, 0)

  const add = () => {
    if (!amount || Number(amount) <= 0) {
      toast.error("יש להזין סכום תקין")
      return
    }
    updateLead(lead.id, {
      expenses: [
        ...lead.expenses,
        {
          id: uid("e"),
          type,
          amount: Number(amount),
          hasReceipt,
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    })
    setAmount("")
    setHasReceipt(false)
    setAdding(false)
    toast.success("ההוצאה נוספה")
  }

  const remove = (id: string) => {
    updateLead(lead.id, { expenses: lead.expenses.filter((e) => e.id !== id) })
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">הוצאות ההדרכה</h2>
        <span className="text-sm font-bold text-destructive">
          {formatCurrency(total)}
        </span>
      </div>

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
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {formatCurrency(e.amount)}
              </span>
              <button
                type="button"
                onClick={() => remove(e.id)}
                aria-label="מחק הוצאה"
                className="text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <Select value={type} onValueChange={(v) => setType(v ?? "")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Button variant="outline" className="flex-1" onClick={() => setAdding(false)}>
              ביטול
            </Button>
            <Button className="flex-1" onClick={add}>
              הוסף
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="justify-center" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          הוסף הוצאה
        </Button>
      )}
    </Card>
  )
}
