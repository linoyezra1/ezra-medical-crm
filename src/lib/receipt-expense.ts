import {
  PAID_PAYMENT_STATUS,
  TRAINING_SALE_PENDING_PAYMENT,
} from "@/lib/payment"

export const RECEIPT_EXPENSE_TYPE = "קבלה"
export const RECEIPT_TAX_RATE = 0.2
export const RECEIPT_EXPENSE_NOTES =
  "נוצר אוטומטית מרישום תשלום (20% מס קבלה)"

export function receiptExpenseAmount(paymentAmount: number): number {
  const n = Number(paymentAmount)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * RECEIPT_TAX_RATE * 100) / 100
}

export function isReceiptExpenseType(type: string | null | undefined): boolean {
  return String(type ?? "").trim() === RECEIPT_EXPENSE_TYPE
}

function money(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

export type ReceiptTaxableLead = {
  paymentStatus?: string | null
  paymentReceiptIssued?: boolean | null
  agreedPrice?: number | null
  participants?: Array<{
    paymentStatus?: string | null
    paymentReceiptIssued?: boolean | null
    agreedPrice?: number | null
  }>
  trainingSales?: Array<{
    paymentStatus?: string | null
    receiptIssued?: boolean | null
    unitSellingPrice?: number | null
    quantity?: number | null
  }>
}

/** סכום תשלומים שסומנה עליהם קבלה — הבסיס ל־20% הוצאה */
export function computeReceiptTaxableAmount(
  lead: ReceiptTaxableLead,
  opts?: { leadAmountOverride?: number },
): number {
  let taxable = 0

  if (lead.paymentReceiptIssued && lead.paymentStatus === PAID_PAYMENT_STATUS) {
    const override = opts?.leadAmountOverride
    taxable +=
      override != null && money(override) > 0
        ? money(override)
        : money(lead.agreedPrice)
  }

  for (const p of lead.participants || []) {
    if (p.paymentReceiptIssued && p.paymentStatus === PAID_PAYMENT_STATUS) {
      taxable += money(p.agreedPrice)
    }
  }

  for (const s of lead.trainingSales || []) {
    if (
      s.receiptIssued &&
      s.paymentStatus !== TRAINING_SALE_PENDING_PAYMENT
    ) {
      const qty = Math.max(0, Number(s.quantity) || 0)
      taxable += money(s.unitSellingPrice) * qty
    }
  }

  return taxable
}
