import { isOwnerInstructor } from "@/lib/instructor"
import {
  isLeadPaid,
  PAID_PAYMENT_STATUS,
  TRAINING_SALE_PAID,
} from "@/lib/payment"
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

/** משתתפים פנימיים עם תשלום אישי רשום */
export function internalParticipantsWithPayment(lead: Lead): Participant[] {
  return (lead.participants || []).filter(
    (p) => !p.isExternal && money(p.agreedPrice) > 0 && isParticipantPaid(p),
  )
}

export type ParticipantPaymentEntry = {
  id: string
  name: string
  amount: number
  paid: boolean
}

export type TrainingPaymentSummary = {
  basePrice: number
  externalExpected: number
  expectedTotal: number
  baseCollected: number
  externalCollected: number
  internalCollected: number
  collectedTotal: number
  remaining: number
  progressPct: number
  externals: ParticipantPaymentEntry[]
  internals: ParticipantPaymentEntry[]
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

  const internals = internalParticipantsWithPayment(lead).map((p) => ({
    id: p.id,
    name: p.name,
    amount: money(p.agreedPrice),
    paid: true,
  }))
  const internalCollected = internals.reduce((s, p) => s + p.amount, 0)

  const baseCollected = isLeadPaid(lead) ? basePrice : 0
  const expectedTotal = basePrice + externalExpected
  const collectedTotal = baseCollected + externalCollected + internalCollected
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
    internalCollected,
    collectedTotal,
    remaining,
    progressPct,
    externals,
    internals,
  }
}

/** סכום תצוגה בכרטיס ליד — בסיס + מחירי משתתפים חיצוניים */
export function leadDisplayPrice(lead: Lead): number {
  return computeTrainingPaymentSummary(lead).expectedTotal
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
  salesCommissions: number
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
  const salesCommissions = sales.reduce(
    (s, x) => s + (x.instructorCommissionAmount || 0),
    0,
  )
  const instructorFee = resolveInstructorFee(lead, instructors)
  const otherExpenses = (lead.expenses || [])
    .filter((e) => !isInstructorExpenseType(e.type))
    .reduce((s, e) => s + (e.amount || 0), 0)

  const revenue = pay.basePrice + pay.externalCollected + pay.internalCollected + salesIncome
  const totalExpenses =
    instructorFee + otherExpenses + salesCost + salesCommissions
  return {
    coursePrice,
    salesIncome,
    revenue,
    instructorFee,
    otherExpenses,
    salesCost,
    salesCommissions,
    totalExpenses,
    netProfit: revenue - totalExpenses,
  }
}

function trainingSalesIncome(lead: Lead): number {
  return (lead.trainingSales || []).reduce(
    (s, x) => s + money(x.unitSellingPrice) * money(x.quantity),
    0,
  )
}

function paidTrainingSalesIncome(lead: Lead): number {
  return (lead.trainingSales || [])
    .filter((s) => s.paymentStatus === TRAINING_SALE_PAID)
    .reduce(
      (sum, x) => sum + money(x.unitSellingPrice) * money(x.quantity),
      0,
    )
}

/** עלות מדריך ששולמה/נרשמה — רשומת הוצאת מדריך או תעריף כשההדרכה שולמה */
export function instructorCostPaid(
  lead: Lead,
  instructors: InstructorProfile[],
): number {
  const logged = (lead.expenses || []).filter((e) =>
    isInstructorExpenseType(e.type),
  )
  if (logged.length) {
    return logged.reduce((s, e) => s + money(e.amount), 0)
  }
  if (isLeadPaid(lead)) {
    return resolveInstructorFee(lead, instructors)
  }
  return 0
}

/** האם נרשם לפחות תשלום אחד (הדרכה / משתתף / מכירת ציוד) */
export function leadHasLoggedPayment(lead: Lead): boolean {
  const pay = computeTrainingPaymentSummary(lead)
  if (pay.collectedTotal > 0) return true
  return (lead.trainingSales || []).some(
    (s) => s.paymentStatus === TRAINING_SALE_PAID,
  )
}

/**
 * רווח נקי צפוי להדרכה:
 * (מחיר בסיס + חיצוניים + מכירות ציוד) − עלות מדריך
 */
export function computeExpectedNetProfit(
  lead: Lead,
  instructors: InstructorProfile[],
): number {
  const pay = computeTrainingPaymentSummary(lead)
  const salesIncome = trainingSalesIncome(lead)
  const instructorFee = resolveInstructorFee(lead, instructors)
  return pay.expectedTotal + salesIncome - instructorFee
}

/**
 * רווח נקי ממומש:
 * (תשלומים שנגבו + מכירות ציוד ששולמו) − עלות מדריך ששולמה
 */
export function computeRealizedNetProfit(
  lead: Lead,
  instructors: InstructorProfile[],
): number {
  if (!leadHasLoggedPayment(lead)) return 0
  const pay = computeTrainingPaymentSummary(lead)
  const paidSales = paidTrainingSalesIncome(lead)
  const revenue = pay.collectedTotal + paidSales
  return revenue - instructorCostPaid(lead, instructors)
}

export type DashboardKpis = {
  pipeline: { count: number; expectedNetProfit: number }
  booked: { count: number; expectedNetProfit: number }
}

/** מדדי דשבורד — שלושת כרטיסי ה-KPI */
export function computeDashboardKpis(
  leads: Lead[],
  instructors: InstructorProfile[],
): DashboardKpis {
  const active = leads.filter((l) => l.status !== "lost")
  const pipelineLeads = active.filter((l) => l.status === "new")
  const bookedLeads = active.filter((l) => l.status === "closed")

  const pipelineExpected = pipelineLeads.reduce(
    (s, l) => s + computeExpectedNetProfit(l, instructors),
    0,
  )
  const bookedExpected = bookedLeads.reduce(
    (s, l) => s + computeExpectedNetProfit(l, instructors),
    0,
  )

  return {
    pipeline: {
      count: pipelineLeads.length,
      expectedNetProfit: pipelineExpected,
    },
    booked: {
      count: bookedLeads.length,
      expectedNetProfit: bookedExpected,
    },
  }
}
