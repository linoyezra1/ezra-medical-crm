import "dotenv/config"
import { prisma } from "../src/lib/db.js"
import {
  computeReceiptTaxableAmount,
  isReceiptExpenseType,
  RECEIPT_EXPENSE_NOTES,
  RECEIPT_EXPENSE_TYPE,
  receiptExpenseAmount,
} from "../src/lib/receipt-expense.js"

async function main() {
  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { paymentReceiptIssued: true },
        { participants: { some: { paymentReceiptIssued: true } } },
        { trainingSales: { some: { receiptIssued: true } } },
      ],
    },
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
        select: { id: true, type: true },
      },
    },
  })

  let processed = 0
  let created = 0
  let skippedExisting = 0
  let skippedZero = 0

  for (const lead of leads) {
    processed++
    if (lead.expenses.some((e) => isReceiptExpenseType(e.type))) {
      skippedExisting++
      continue
    }

    const amount = receiptExpenseAmount(computeReceiptTaxableAmount(lead))
    if (amount <= 0) {
      skippedZero++
      continue
    }

    await prisma.expense.create({
      data: {
        leadId: lead.id,
        type: RECEIPT_EXPENSE_TYPE,
        amount,
        notes: RECEIPT_EXPENSE_NOTES,
        createdAt: lead.paymentDate ?? undefined,
      },
    })
    created++
    console.log(
      `created receipt expense ${amount} for lead ${lead.id} (${lead.fullName ?? ""})`,
    )
  }

  console.log(
    `Done. processed=${processed} created=${created} skippedExisting=${skippedExisting} skippedZero=${skippedZero}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
