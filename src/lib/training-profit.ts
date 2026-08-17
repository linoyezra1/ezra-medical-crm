import { isOwnerInstructor } from "@/lib/instructor"
import { isLeadPaid, PAID_PAYMENT_STATUS } from "@/lib/payment"
import type { InstructorProfile, Lead, Participant } from "@/lib/types"

const INSTRUCTOR_EXPENSE_TYPES = new Set([
  "מדריך",
  "instructor",
  "instructor_fee",
])

export function isInstructorExpenseType(type: string): boolean {
  return INSTRUCTOR_EXPENSE_TYPES.has(type.trim())
}

function money(n: number | null | undefined): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function isParticipantPaid(p: Pick<Participant, "paymentStatus">): boolean {
  return p.paymentStatus === PAID_PAYMENT_STATUS
}

/** מחיר אישי של משתתפים חיצוניים (גם אם טרם שולם) */
export function externalParticipantsWithPrice(lead: Lead): Participant[] {
  return (lead.participants || []).filter(
    (p) => p.isExternal && money(p.agreedPrice) > 0,
  )
}

export type TrainingPaymentSummary = {
  basePrice: number
  externalExpected: number
  expectedTotal: number
  baseCollected: number
  externalCollected: number
  collectedTotal: number
  remaining: number
  progressPct: number
  externals: Array<{
    id: string
    name: string
    amount: number
    paid: boolean
  }>
}

/**
 * סיכום תשלומים להדרכה:
 * צפוי = מחיר בסיס + מחירי משתתפים חיצוניים
 * נגבה = תשלום הדרכה שנרשם + תשלומים שנרשמו למשתתפים
 */
export function computeTrainingPaymentSummary(
  lead: Lead,
): TrainingPaymentSummary {
  const basePrice = money(lead.totalPrice)
  const externals = externalParticipantsWithPrice(lead).map((p) => ({
    id: p.id,
    name: p.name,
    amount: money(p.agreedPrice),
    paid: isParticipantPaid(p),
  }))
  const externalExpected = externals.reduce((s, p) => s + p.amount, 0)
  const externalCollected = externals
    .filter((p) => p.paid)
    .reduce((s, p) => s + p.amount, 0)
  const baseCollected = isLeadPaid(lead) ? basePrice : 0
  const expectedTotal = basePrice + externalExpected
  const collectedTotal = baseCollected + externalCollected
  const remaining = Math.max(0, expectedTotal - collectedTotal)
  const progressPct =
    expectedTotal > 0
      ? Math.min(100, Math.round((collectedTotal / expectedTotal) * 100))
      : 0
  return {
    basePrice,
    externalExpected,
    expectedTotal,
    baseCollected,
    externalCollected,
    collectedTotal,
    remaining,
    progressPct,
    externals,
  }
}

/**
 * תעריף מדריך חי מפרופיל (מקור אמת).
 * דריסה להדרכה ספציפית נלקחת רק אם אין פרופיל חי זמין.
 * יצחק — ללא עלות מדריך.
 */
export function resolveInstructorFee(
  lead: Pick<Lead, "instructorId" | "instructorFeeOverride" | "instructor">,
  instructors: InstructorProfile[],
): number {
  if (isOwnerInstructor(lead.instructor)) return 0

  const byId = lead.instructorId
    ? instructors.find((i) => i.id === lead.instructorId)
    : undefined
  if (byId) return Math.max(0, byId.fee || 0)

  const name = lead.instructor?.trim()
  if (name) {
    const byName = instructors.find(
      (i) => i.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (byName) return Math.max(0, byName.fee || 0)
  }

  // אין פרופיל — נפילה לדריסה מפורשת בהדרכה (אם קיימת)
  if (
    lead.instructorFeeOverride != null &&
    Number.isFinite(lead.instructorFeeOverride)
  ) {
    return Math.max(0, Number(lead.instructorFeeOverride))
  }

  return 0
}

export type TrainingProfitSummary = {
  coursePrice: number
  salesIncome: number
  revenue: number
  instructorFee: number
  otherExpenses: number
  salesCost: number
  totalExpenses: number
  netProfit: number
}

/**
 * רווח הדרכה:
 * (מחיר הדרכה כולל חיצוניים + מכירות ציוד) − (תעריף מדריך חי + הוצאות אחרות [+ עלות מלאי])
 * מחיר הדרכה בתצוגה = בסיס + כל מחירי החיצוניים.
 * ברווח נספרים תשלומי חיצוניים שנגבו (הבסיס נספר כערך ההדרכה).
 */
export function computeTrainingProfit(
  lead: Lead,
  instructors: InstructorProfile[],
): TrainingProfitSummary {
  const pay = computeTrainingPaymentSummary(lead)
  const coursePrice = pay.expectedTotal
  const sales = lead.trainingSales || []
  const salesIncome = sales.reduce(
    (s, x) => s + (x.unitSellingPrice || 0) * (x.quantity || 0),
    0,
  )
  const salesCost = sales.reduce(
    (s, x) => s + (x.unitCostPrice || 0) * (x.quantity || 0),
    0,
  )
  const instructorFee = resolveInstructorFee(lead, instructors)
  const otherExpenses = (lead.expenses || [])
    .filter((e) => !isInstructorExpenseType(e.type))
    .reduce((s, e) => s + (e.amount || 0), 0)

  const revenue = pay.basePrice + pay.externalCollected + salesIncome
  const totalExpenses = instructorFee + otherExpenses + salesCost
  return {
    coursePrice,
    salesIncome,
    revenue,
    instructorFee,
    otherExpenses,
    salesCost,
    totalExpenses,
    netProfit: revenue - totalExpenses,
  }
}
