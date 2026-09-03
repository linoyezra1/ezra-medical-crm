import {
  PAID_PAYMENT_STATUS,
  PAYMENT_METHODS,
  TRAINING_SALE_PAID,
  TRAINING_SALE_PENDING_PAYMENT,
} from "@/lib/payment"

/** סוגי תשלום ביומן השטוח */
export const PAYMENT_TRANSACTION_TYPES = [
  "regular_participant",
  "external_participant",
  "training_sale",
  "standalone_sale",
  "training_base",
] as const

export type PaymentTransactionType =
  (typeof PAYMENT_TRANSACTION_TYPES)[number]

export const PAYMENT_TRANSACTION_TYPE_LABELS: Record<
  PaymentTransactionType,
  string
> = {
  regular_participant: "משתתף רגיל",
  external_participant: "משתתף חיצוני",
  training_sale: "מכירת ציוד בהדרכה",
  standalone_sale: "מכירה בודדת",
  training_base: "תשלום הדרכה",
}

export type PaymentLedgerStatus = "paid" | "pending" | "cancelled"

export const PAYMENT_LEDGER_STATUS_LABELS: Record<PaymentLedgerStatus, string> =
  {
    paid: "שולם",
    pending: "ממתין",
    cancelled: "בוטל",
  }

/** סטטוסי DB שבהם ההדרכה נסגרה ביומן — רק אז מותר «ממתין לתשלום» ביומן */
export const PAYMENT_LEDGER_ELIGIBLE_COURSE_STATUSES = [
  "closed",
  "certificates_pending",
  "completed",
  "closed_won",
] as const

export function isLeadEligibleForPaymentLedger(
  courseStatus: string | null | undefined,
): boolean {
  const s = (courseStatus || "").trim()
  return (PAYMENT_LEDGER_ELIGIBLE_COURSE_STATUSES as readonly string[]).includes(
    s,
  )
}

export type PaymentTransaction = {
  id: string
  date: string
  type: PaymentTransactionType
  payerName: string
  receivedBy: string
  trainingName: string
  trainingId: string | null
  amount: number
  paymentMethod: string
  paymentStatus: PaymentLedgerStatus
}

export type PaymentTransactionFilters = {
  dateFrom?: string
  dateTo?: string
  type?: PaymentTransactionType | "all"
  paymentMethod?: string | "all"
  receivedBy?: string | "all"
  paymentStatus?: PaymentLedgerStatus | "all"
  search?: string
}

export type PaymentTransactionsSummary = {
  totalCollected: number
  byMethod: { method: string; label: string; amount: number }[]
  cashTotal: number
  bitTotal: number
  bankTransferTotal: number
  /** שולם שלא במזומן / ביט / העברה (פייבוקס, צ'ק, אחר, לא צוין) */
  otherCollectedTotal: number
  pendingTotal: number
  pendingCount: number
  count: number
}

function money(n: number | null | undefined): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

function toDateKey(
  value: Date | string | null | undefined,
  fallback?: Date | string | null,
): string {
  const raw = value ?? fallback
  if (!raw) return new Date().toISOString().slice(0, 10)
  if (typeof raw === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return new Date().toISOString().slice(0, 10)
  }
  if (!Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

export function normalizePaymentLedgerStatus(
  status: string | null | undefined,
): PaymentLedgerStatus {
  const s = (status || "").trim().toLowerCase()
  if (
    s === "paid" ||
    s === PAID_PAYMENT_STATUS.toLowerCase() ||
    s === TRAINING_SALE_PAID
  ) {
    return "paid"
  }
  if (
    s === "cancelled" ||
    s === "canceled" ||
    s === "void" ||
    s === "בוטל"
  ) {
    return "cancelled"
  }
  return "pending"
}

export function paymentMethodLabel(value: string | null | undefined): string {
  const v = (value || "").trim()
  if (!v) return "—"
  return PAYMENT_METHODS.find((m) => m.value === v)?.label || v
}

export function sortPaymentTransactions(
  rows: PaymentTransaction[],
): PaymentTransaction[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.id.localeCompare(a.id)
  })
}

export function filterPaymentTransactions(
  rows: PaymentTransaction[],
  filters: PaymentTransactionFilters,
): PaymentTransaction[] {
  const q = (filters.search || "").trim().toLowerCase()
  const type = filters.type && filters.type !== "all" ? filters.type : null
  const method =
    filters.paymentMethod && filters.paymentMethod !== "all"
      ? filters.paymentMethod
      : null
  const receivedBy =
    filters.receivedBy && filters.receivedBy !== "all"
      ? filters.receivedBy
      : null
  const paymentStatus =
    filters.paymentStatus && filters.paymentStatus !== "all"
      ? filters.paymentStatus
      : null

  return rows.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false
    if (filters.dateTo && row.date > filters.dateTo) return false
    if (type && row.type !== type) return false
    if (paymentStatus && row.paymentStatus !== paymentStatus) return false
    if (method) {
      if (method === "__none__") {
        if (row.paymentMethod) return false
      } else if (row.paymentMethod !== method) {
        return false
      }
    }
    if (receivedBy) {
      if (receivedBy === "__none__") {
        if (row.receivedBy && row.receivedBy !== "—") return false
      } else if (row.receivedBy !== receivedBy) {
        return false
      }
    }
    if (q) {
      const hay = `${row.payerName} ${row.trainingName}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function summarizePaymentTransactions(
  rows: PaymentTransaction[],
): PaymentTransactionsSummary {
  const paid = rows.filter((r) => r.paymentStatus === "paid")
  const pending = rows.filter((r) => r.paymentStatus === "pending")
  const byMethodMap = new Map<string, number>()
  let cashTotal = 0
  let bitTotal = 0
  let bankTransferTotal = 0
  let otherCollectedTotal = 0
  let totalCollected = 0
  let pendingTotal = 0

  for (const row of paid) {
    totalCollected += row.amount
    const key = row.paymentMethod || "__none__"
    byMethodMap.set(key, (byMethodMap.get(key) || 0) + row.amount)
    if (key === "cash") cashTotal += row.amount
    else if (key === "bit") bitTotal += row.amount
    else if (key === "bank_transfer") bankTransferTotal += row.amount
    else otherCollectedTotal += row.amount
  }

  for (const row of pending) {
    pendingTotal += row.amount
  }

  const byMethod = Array.from(byMethodMap.entries())
    .map(([method, amount]) => ({
      method,
      label: method === "__none__" ? "לא צוין" : paymentMethodLabel(method),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    totalCollected,
    byMethod,
    cashTotal,
    bitTotal,
    bankTransferTotal,
    otherCollectedTotal,
    pendingTotal,
    pendingCount: pending.length,
    count: rows.length,
  }
}

export function uniqueReceivedByOptions(
  rows: PaymentTransaction[],
): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    const v = row.receivedBy?.trim()
    if (v && v !== "—") set.add(v)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "he"))
}

/** בוני שורות — משותפים ל-Server Action */
export function buildParticipantTransaction(input: {
  id: string
  isExternal: boolean
  fullName: string
  agreedPrice: number | null | undefined
  paymentStatus: string | null | undefined
  paymentDate: Date | string | null | undefined
  paymentMethod: string | null | undefined
  paymentReceivedBy: string | null | undefined
  createdAt: Date | string
  leadId: string | null
  leadName: string | null
}): PaymentTransaction | null {
  const amount = money(input.agreedPrice)
  const hasStatus = Boolean(input.paymentStatus?.trim())
  if (amount <= 0 && !hasStatus) return null

  return {
    id: `participant:${input.id}`,
    date: toDateKey(input.paymentDate, input.createdAt),
    type: input.isExternal ? "external_participant" : "regular_participant",
    payerName: input.fullName.trim() || "משתתף",
    receivedBy: input.paymentReceivedBy?.trim() || "—",
    trainingName: input.leadName?.trim() || "מכירה ללא הדרכה",
    trainingId: input.leadId,
    amount,
    paymentMethod: input.paymentMethod?.trim() || "",
    paymentStatus: normalizePaymentLedgerStatus(input.paymentStatus),
  }
}

export function buildSaleTransaction(input: {
  id: string
  leadId: string | null
  leadName: string | null
  itemName: string
  quantity: number
  unitSellingPrice: number
  paymentStatus: string | null | undefined
  paymentMethod: string | null | undefined
  participantName: string | null | undefined
  reportedByName: string | null | undefined
  createdAt: Date | string
}): PaymentTransaction {
  const amount =
    money(input.unitSellingPrice) * Math.max(1, money(input.quantity) || 1)
  const hasLead = Boolean(input.leadId)
  return {
    id: `sale:${input.id}`,
    date: toDateKey(input.createdAt),
    type: hasLead ? "training_sale" : "standalone_sale",
    payerName:
      input.participantName?.trim() ||
      input.leadName?.trim() ||
      input.itemName.trim() ||
      "לקוח",
    receivedBy: input.reportedByName?.trim() || "—",
    trainingName: hasLead
      ? input.leadName?.trim() || "הדרכה"
      : "מכירה ללא הדרכה",
    trainingId: input.leadId,
    amount,
    paymentMethod: input.paymentMethod?.trim() || "",
    paymentStatus: normalizePaymentLedgerStatus(
      input.paymentStatus || TRAINING_SALE_PENDING_PAYMENT,
    ),
  }
}

export function buildTrainingBaseTransaction(input: {
  id: string
  fullName: string
  amount: number | null | undefined
  paymentStatus: string | null | undefined
  paymentDate: Date | string | null | undefined
  paymentMethod: string | null | undefined
  paymentReceivedBy: string | null | undefined
  createdAt: Date | string
  /** תאריך הדרכה לתצוגה כשעדיין ממתין לתשלום */
  trainingDate?: Date | string | null
}): PaymentTransaction | null {
  const amount = money(input.amount)
  if (amount <= 0) return null

  const statusFromField = normalizePaymentLedgerStatus(input.paymentStatus)
  const isPaid =
    statusFromField === "paid" ||
    input.paymentStatus === PAID_PAYMENT_STATUS ||
    Boolean(input.paymentDate)

  return {
    id: `lead-base:${input.id}`,
    date: toDateKey(
      input.paymentDate,
      input.trainingDate || input.createdAt,
    ),
    type: "training_base",
    payerName: input.fullName.trim() || "לקוח",
    receivedBy: input.paymentReceivedBy?.trim() || "—",
    trainingName: input.fullName.trim() || "הדרכה",
    trainingId: input.id,
    amount,
    paymentMethod: input.paymentMethod?.trim() || "",
    paymentStatus: isPaid ? "paid" : "pending",
  }
}

export function buildEquipmentDealTransaction(input: {
  id: string
  title: string
  contactName: string
  amount: number | null | undefined
  paymentStatus: string | null | undefined
  paymentDate: Date | string | null | undefined
  paymentMethod: string | null | undefined
  paymentReceivedBy: string | null | undefined
  equipmentStatus: string | null | undefined
  createdAt: Date | string
  updatedAt: Date | string
}): PaymentTransaction | null {
  const amount = money(input.amount)
  if (amount <= 0) return null

  const eq = (input.equipmentStatus || "").toLowerCase()
  const ledgerStatus = normalizePaymentLedgerStatus(input.paymentStatus)
  const isPaidUi =
    ledgerStatus === "paid" ||
    eq === "paid" ||
    eq === "invoice" ||
    eq === "order" ||
    eq === "שולם"

  if (!isPaidUi && !input.paymentDate) return null

  return {
    id: `equipment:${input.id}`,
    date: toDateKey(
      input.paymentDate,
      input.updatedAt || input.createdAt,
    ),
    type: "standalone_sale",
    payerName: input.contactName.trim() || "לקוח ציוד",
    receivedBy: input.paymentReceivedBy?.trim() || "—",
    trainingName: input.title.trim() || "מכירה ללא הדרכה",
    trainingId: null,
    amount,
    paymentMethod: input.paymentMethod?.trim() || "",
    paymentStatus: isPaidUi ? "paid" : ledgerStatus,
  }
}
