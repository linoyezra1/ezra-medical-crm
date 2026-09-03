import { prisma } from "@/lib/db"
import {
  computeReceiptTaxableAmount,
  isReceiptExpenseType,
  RECEIPT_EXPENSE_NOTES,
  RECEIPT_EXPENSE_TYPE,
  receiptExpenseAmount,
} from "@/lib/receipt-expense"
import { jerusalemLocalToUtcDate } from "@/lib/timezone"

export async function syncReceiptExpenseForLead(
  leadId: string,
  opts?: { leadAmountOverride?: number; paymentDate?: string },
): Promise<{ amount: number; created: boolean; updated: boolean; deleted: boolean }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      participants: {
        select: {
          agreedPrice: true,
          paymentStatus: true,
          paymentReceiptIssued: true,
        },
      },
      trainingSales: {
        select: {
          quantity: true,
          unitSellingPrice: true,
          paymentStatus: true,
          receiptIssued: true,
        },
      },
      expenses: {
        select: { id: true, type: true, notes: true },
      },
    },
  })

  if (!lead) {
    return { amount: 0, created: false, updated: false, deleted: false }
  }

  const taxable = computeReceiptTaxableAmount(lead, {
    leadAmountOverride: opts?.leadAmountOverride,
  })
  const amount = receiptExpenseAmount(taxable)
  const existing = lead.expenses.find((e) => isReceiptExpenseType(e.type))
  const isAuto =
    Boolean(existing) &&
    String(existing?.notes ?? "").trim() === RECEIPT_EXPENSE_NOTES

  if (amount <= 0) {
    if (existing && isAuto) {
      await prisma.expense.delete({ where: { id: existing.id } })
      return { amount: 0, created: false, updated: false, deleted: true }
    }
    return { amount: 0, created: false, updated: false, deleted: false }
  }

  let createdAt: Date | undefined
  if (opts?.paymentDate) {
    const parsed = jerusalemLocalToUtcDate(opts.paymentDate, "12:00")
    if (!Number.isNaN(parsed.getTime())) createdAt = parsed
  }

  if (existing) {
    await prisma.expense.update({
      where: { id: existing.id },
      data: {
        type: RECEIPT_EXPENSE_TYPE,
        amount,
        notes: RECEIPT_EXPENSE_NOTES,
      },
    })
    return { amount, created: false, updated: true, deleted: false }
  }

  await prisma.expense.create({
    data: {
      leadId,
      type: RECEIPT_EXPENSE_TYPE,
      amount,
      notes: RECEIPT_EXPENSE_NOTES,
      ...(createdAt ? { createdAt } : {}),
    },
  })
  return { amount, created: true, updated: false, deleted: false }
}
