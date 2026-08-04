import { formatCourseTypeLabel } from "@/lib/course-type"
import { isLeadPaid } from "@/lib/payment"
import { computeTrainingProfit } from "@/lib/training-profit"
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

/** הדרכות שנכללות ברווח — רק אם שולמו */
function isRevenueLead(lead: Lead): boolean {
  return isLeadPaid(lead)
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

    const date = toDateKey(
      lead.paymentDate || lead.date,
      lead.updatedAt || lead.createdAt,
    )
    const profit = computeTrainingProfit(lead, instructors)

    rows.push({
      id: lead.id,
      kind: "course",
      date,
      monthKey: date.slice(0, 7),
      itemLabel: courseItemLabel(lead, courses),
      revenue: profit.revenue,
      expenses: profit.totalExpenses,
      netProfit: profit.netProfit,
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
