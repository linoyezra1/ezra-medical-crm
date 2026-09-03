"use client"

import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/helpers"
import { receiptExpenseAmount } from "@/lib/receipt-expense"

export function ReceiptExpensePreview({
  visible,
  paymentAmount,
}: {
  visible: boolean
  paymentAmount: number | string
}) {
  if (!visible) return null

  const payment = Number(paymentAmount)
  const valid = Number.isFinite(payment) && payment > 0
  const expense = valid ? receiptExpenseAmount(payment) : 0

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        סכום הוצאת קבלה (20% מס) לרישום:
      </label>
      <Input
        readOnly
        disabled
        value={
          valid
            ? `${formatCurrency(expense)} מתוך ${formatCurrency(payment)}`
            : "—"
        }
        dir="ltr"
        className="text-left"
      />
    </div>
  )
}
