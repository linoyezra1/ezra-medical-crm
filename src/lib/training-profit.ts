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

/** מחיר אישי של משתתפים חיצוניים פעילים (לא לידים) */
export function externalParticipantsWithPrice(lead: Lead): Participant[] {
  return (lead.participants || []).filter(
    (p) => p.isExternal && !p.isLead && money(p.agreedPrice) > 0,
  )
}

/** משתתפים פנימיים עם תשלום אישי רשום (לא לידים) */
export function internalParticipantsWithPayment(lead: Lead): Participant[] {
  return (lead.participants || []).filter(
    (p) =>
      !p.isExternal &&
      !p.isLead &&
      money(p.agreedPrice) > 0 &&
      isParticipantPaid(p),
  )
}

/** משתתפים שמסומנים כליד עם מחיר אופציה */
export function leadOptionParticipants(lead: Lead): Participant[] {
  return (lead.participants || []).filter(
    (p) => Boolean(p.isLead) && money(p.agreedPrice) > 0,
  )
}

export type ParticipantPaymentEntry = {
  id: string
  name: string
  amount: number
  paid: boolean
}

export type SalePaymentEntry = {
  id: string
  name: string
  amount: number
  paid: boolean
}

export type TrainingPaymentSummary = {
  basePrice: number
  externalExpected: number
  /** סכום מכירות ציוד הצפוי לגבייה */
  salesExpected: number
  expectedTotal: number
  /** תשלום בסיס שנרשם במפורש על ההדרכה (0 או מחיר בסיס מלא) */
  baseCollected: number
  /**
   * כיסוי בסיס בפועל = תשלום בסיס + תשלומי משתתפים פנימיים
   * (פנימיים מקזזים את מחיר הבסיס)
   */
  baseCoveredAmount: number
  /** מחיר הבסיס כוסה במלואו (תשלום בסיס ו/או פנימיים) */
  baseSettled: boolean
  externalCollected: number
  internalCollected: number
  /** סכום מכירות ציוד שנגבו */
  salesCollected: number
  collectedTotal: number
  remaining: number
  /** יתרה 0 — ההדרכה נחשבת שולמה במלואה לצורך סטטוס ״הסתיים״ */
  isFullySettled: boolean
  progressPct: number
  externals: ParticipantPaymentEntry[]
  internals: ParticipantPaymentEntry[]
  sales: SalePaymentEntry[]
  /** סכום אופציה ממשתתפים שמסומנים כליד */
  leadOptionAmount: number
  leadOptionCount: number
}

function saleLineAmount(s: {
  unitSellingPrice?: number
  quantity?: number
}): number {
  return money(s.unitSellingPrice) * money(s.quantity)
}

/**
 * סיכום תשלומים להדרכה:
 * צפוי = מחיר בסיס + מחירי משתתפים חיצוניים + מכירות ציוד
 * נגבה = תשלום הדרכה שנרשם + תשלומי חיצוניים + תשלומי פנימיים + מכירות ששולמו
 * (תשלומי פנימיים מקזזים את מחיר הבסיס)
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

  const sales = (lead.trainingSales || [])
    .map((s) => ({
      id: s.id,
      name: s.itemName || "מכירת ציוד",
      amount: saleLineAmount(s),
      paid: s.paymentStatus === TRAINING_SALE_PAID,
    }))
    .filter((s) => s.amount > 0)
  const salesExpected = sales.reduce((s, x) => s + x.amount, 0)
  const salesCollected = sales
    .filter((s) => s.paid)
    .reduce((s, x) => s + x.amount, 0)

  const baseCollected = isLeadPaid(lead) ? basePrice : 0
  const baseCoveredAmount = Math.min(
    basePrice,
    baseCollected + internalCollected,
  )
  const baseSettled = basePrice <= 0 || baseCoveredAmount >= basePrice
  const expectedTotal = basePrice + externalExpected + salesExpected
  const collectedTotal =
    baseCollected + externalCollected + internalCollected + salesCollected
  const remaining = Math.max(0, expectedTotal - collectedTotal)
  const isFullySettled = remaining <= 0
  const progressPct =
    expectedTotal > 0
      ? Math.min(100, Math.round((collectedTotal / expectedTotal) * 100))
      : isFullySettled
        ? 100
        : 0

  const leadOptions = leadOptionParticipants(lead)
  const leadOptionAmount = leadOptions.reduce(
    (s, p) => s + money(p.agreedPrice),
    0,
  )
  const leadOptionCount = leadOptions.length

  return {
    basePrice,
    externalExpected,
    salesExpected,
    expectedTotal,
    baseCollected,
    baseCoveredAmount,
    baseSettled,
    externalCollected,
    internalCollected,
    salesCollected,
    collectedTotal,
    remaining,
    isFullySettled,
    progressPct,
    externals,
    internals,
    sales,
    leadOptionAmount,
    leadOptionCount,
  }
}

/** האם יתרת ההדרכה מכוסה (בסיס + חיצוניים + מכירות) — כולל קיזוז מתשלומי פנימיים */
export function isTrainingFullySettled(
  lead: Pick<Lead, "totalPrice" | "paymentStatus" | "participants"> &
    Partial<Pick<Lead, "trainingSales">>,
): boolean {
  return computeTrainingPaymentSummary(lead as Lead).isFullySettled
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
 * (מחיר הדרכה כולל חיצוניים + מכירות ציוד) − (תעריף מדריך חי + הוצאות אחרות + עלות ציוד [+ עמלות])
 * מחיר הדרכה בתצוגה = בסיס + מחירי חיצוניים (ללא מכירות).
 * ברווח נספרים תשלומי חיצוניים שנגבו (הבסיס נספר כערך ההדרכה) + הכנסות ממכירות.
 */
export function computeTrainingProfit(
  lead: Lead,
  instructors: InstructorProfile[],
): TrainingProfitSummary {
  const pay = computeTrainingPaymentSummary(lead)
  const coursePrice = pay.basePrice + pay.externalExpected
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

  const revenue =
    pay.basePrice + pay.externalCollected + pay.internalCollected + salesIncome
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
  return pay.collectedTotal > 0
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
  const instructorFee = resolveInstructorFee(lead, instructors)
  return pay.expectedTotal - instructorFee
}

/**
 * רווח נקי ממומש:
 * (תשלומים שנגבו כולל מכירות ששולמו) − עלות מדריך ששולמה
 */
export function computeRealizedNetProfit(
  lead: Lead,
  instructors: InstructorProfile[],
): number {
  if (!leadHasLoggedPayment(lead)) return 0
  const pay = computeTrainingPaymentSummary(lead)
  return pay.collectedTotal - instructorCostPaid(lead, instructors)
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
