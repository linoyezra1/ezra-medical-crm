import { isOwnerInstructor } from "@/lib/instructor"
import type { InstructorProfile, Lead } from "@/lib/types"

const INSTRUCTOR_EXPENSE_TYPES = new Set([
  "מדריך",
  "instructor",
  "instructor_fee",
])

export function isInstructorExpenseType(type: string): boolean {
  return INSTRUCTOR_EXPENSE_TYPES.has(type.trim())
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
 * (מחיר הדרכה + מכירות ציוד) − (תעריף מדריך חי + הוצאות אחרות [+ עלות מלאי])
 */
export function computeTrainingProfit(
  lead: Lead,
  instructors: InstructorProfile[],
): TrainingProfitSummary {
  const coursePrice = lead.totalPrice || 0
  const externalPaid = (lead.participants || [])
    .filter(
      (p) =>
        p.isExternal &&
        p.paymentStatus === "paid_in_full" &&
        (p.agreedPrice || 0) > 0,
    )
    .reduce((s, p) => s + (p.agreedPrice || 0), 0)
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

  const revenue = coursePrice + externalPaid + salesIncome
  const totalExpenses = instructorFee + otherExpenses + salesCost
  return {
    coursePrice: coursePrice + externalPaid,
    salesIncome,
    revenue,
    instructorFee,
    otherExpenses,
    salesCost,
    totalExpenses,
    netProfit: revenue - totalExpenses,
  }
}
