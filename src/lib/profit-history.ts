import { formatCourseTypeLabel } from "@/lib/course-type"
import {
  computeTrainingPaymentSummary,
  computeTrainingProfit,
  leadHasLoggedPayment,
  type TrainingPaymentSummary,
} from "@/lib/training-profit"
import { formatInJerusalem } from "@/lib/timezone"
import type {
  CourseCatalogItem,
  EquipmentDeal,
  InstructorProfile,
  Lead,
} from "@/lib/types"

export type ProfitTransaction = {
  id: string
  kind: "course" | "equipment" | "training_sale"
  date: string // YYYY-MM-DD
  monthKey: string // YYYY-MM
  itemLabel: string
  revenue: number
  expenses: number
  netProfit: number
  remaining: number
  clientId: string
  clientName: string
}

export type ProfitMonthGroup = {
  monthKey: string
  label: string
  revenue: number
  expenses: number
  netProfit: number
  transactions: ProfitTransaction[]
}

const REVENUE_EQUIPMENT_STATUSES = new Set(["order", "invoice", "paid"])

/** הדרכות שנכללות ברווח — כל הדרכה עם תשלום בפועל */
function isRevenueLead(lead: Lead): boolean {
  return leadHasLoggedPayment(lead)
}

function toDateKey(isoOrDate: string | undefined, fallback: string): string {
  if (isoOrDate && /^\d{4}-\d{2}-\d{2}/.test(isoOrDate)) {
    return isoOrDate.slice(0, 10)
  }
  if (fallback && /^\d{4}-\d{2}-\d{2}/.test(fallback)) {
    return fallback.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number)
  const d = new Date(y, (m || 1) - 1, 1)
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
  }).format(d)
}

/** מפתח חודש קלנדרי YYYY-MM לפי שעון ישראל */
export function calendarMonthKeyFromDate(d: Date): string {
  const { date } = formatInJerusalem(d)
  if (date) return date.slice(0, 7)
  return d.toISOString().slice(0, 7)
}

export function currentCalendarMonthKey(): string {
  return calendarMonthKeyFromDate(new Date())
}

export type MonthProfitSummary = {
  monthKey: string
  monthLabel: string
  netProfit: number
  paidCoursesCount: number
  revenue: number
  expenses: number
}

/** סיכום רווח לחודש — אותה לוגיקה כמו בחלונית ההיסטוריה */
export function summarizeProfitMonth(
  transactions: ProfitTransaction[],
  monthKey: string,
): Omit<MonthProfitSummary, "monthKey" | "monthLabel"> {
  const monthTxs = transactions.filter((t) => t.monthKey === monthKey)
  const courseTxs = monthTxs.filter((t) => t.kind === "course")
  return {
    netProfit: monthTxs.reduce((s, t) => s + t.netProfit, 0),
    paidCoursesCount: courseTxs.length,
    revenue: monthTxs.reduce((s, t) => s + t.revenue, 0),
    expenses: monthTxs.reduce((s, t) => s + t.expenses, 0),
  }
}

/**
 * רווח נקי ממומש לחודש נוכחי (קוביית KPI).
 * מסונן לפי תאריך הדרכה (lead.date) — זהה לפירוט בהיסטוריה.
 */
export function computeCurrentMonthRealizedKpi(
  leads: Lead[],
  equipment: EquipmentDeal[],
  courses: CourseCatalogItem[] | undefined,
  instructors: InstructorProfile[],
  monthKey: string = currentCalendarMonthKey(),
): MonthProfitSummary {
  const txs = buildProfitTransactions(leads, equipment, courses, instructors)
  const summary = summarizeProfitMonth(txs, monthKey)
  return {
    monthKey,
    monthLabel: monthLabel(monthKey),
    ...summary,
  }
}

function courseItemLabel(
  lead: Lead,
  courses?: CourseCatalogItem[],
): string {
  return (
    formatCourseTypeLabel(lead.courseType, {
      other: lead.courseTypeOther,
      catalog: courses,
    }) || "קורס / הדרכה"
  )
}

/** Build revenue/profit transactions from closed courses + equipment deals */
export function buildProfitTransactions(
  leads: Lead[],
  equipment: EquipmentDeal[],
  courses?: CourseCatalogItem[],
  instructors: InstructorProfile[] = [],
): ProfitTransaction[] {
  const rows: ProfitTransaction[] = []

  for (const lead of leads) {
    if (lead.status === "lost") continue
    if (!isRevenueLead(lead)) continue

    const date = toDateKey(lead.date, lead.updatedAt || lead.createdAt)
    const pay = computeTrainingPaymentSummary(lead)
    const profit = computeTrainingProfit(lead, instructors)

    const paidSalesIncome = (lead.trainingSales || [])
      .filter((s) => s.paymentStatus === "paid")
      .reduce((s, x) => s + (x.unitSellingPrice || 0) * (x.quantity || 0), 0)
    const cashRevenue = pay.collectedTotal + paidSalesIncome
    const cashExpenses = profit.totalExpenses

    rows.push({
      id: lead.id,
      kind: "course",
      date,
      monthKey: date.slice(0, 7),
      itemLabel: courseItemLabel(lead, courses),
      revenue: cashRevenue,
      expenses: cashExpenses,
      netProfit: cashRevenue - cashExpenses,
      remaining: pay.remaining,
      clientId: lead.clientId,
      clientName: lead.name,
    })
  }

  for (const deal of equipment) {
    if (!REVENUE_EQUIPMENT_STATUSES.has(deal.status)) continue
    const date = toDateKey(deal.updatedAt, deal.createdAt)
    const revenue = deal.amount || 0

    rows.push({
      id: deal.id,
      kind: "equipment",
      date,
      monthKey: date.slice(0, 7),
      itemLabel: deal.title || "ציוד",
      revenue,
      expenses: 0,
      netProfit: revenue,
      remaining: 0,
      clientId: deal.clientId,
      clientName: deal.contactName || "לקוח ציוד",
    })
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.id.localeCompare(a.id)
  })

  return rows
}

export function groupProfitByMonth(
  transactions: ProfitTransaction[],
): ProfitMonthGroup[] {
  const map = new Map<string, ProfitTransaction[]>()
  for (const t of transactions) {
    if (!map.has(t.monthKey)) map.set(t.monthKey, [])
    map.get(t.monthKey)!.push(t)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, list]) => {
      const revenue = list.reduce((s, t) => s + t.revenue, 0)
      const expenses = list.reduce((s, t) => s + t.expenses, 0)
      return {
        monthKey,
        label: monthLabel(monthKey),
        revenue,
        expenses,
        netProfit: revenue - expenses,
        transactions: list,
      }
    })
}
