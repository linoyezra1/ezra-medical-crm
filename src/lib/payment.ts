/** סטטוס תשלום שולם במלואו */
export const PAID_PAYMENT_STATUS = "paid_in_full"

/** קידומת משימת גבייה אוטומטית */
export const UNPAID_PAYMENT_TASK_PREFIX = "גביית תשלום להדרכה"

export const PAYMENT_METHODS = [
  { value: "bit", label: "ביט" },
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
  { value: "paybox", label: "פייבוקס" },
  { value: "other", label: "אחר" },
] as const

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"]

export const PAYMENT_RECEIVERS = ["יצחק", "לינוי"] as const

export type PaymentReceiver = (typeof PAYMENT_RECEIVERS)[number]

export function isLeadPaid(lead: {
  paymentStatus?: string | null
}): boolean {
  return lead.paymentStatus === PAID_PAYMENT_STATUS
}

export function unpaidPaymentTaskTitle(leadName: string): string {
  return `${UNPAID_PAYMENT_TASK_PREFIX} — ${leadName.trim() || "הדרכה"}`
}

export type TrainingSessionSlot = {
  date: string // YYYY-MM-DD
  time: string // HH:mm
  endTime?: string
}

export function parseSessionsJson(
  raw?: string | null,
): TrainingSessionSlot[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const slots: TrainingSessionSlot[] = []
    for (const s of parsed) {
      if (!s || typeof s !== "object") continue
      const o = s as Record<string, unknown>
      const date = String(o.date || "").trim()
      const time = String(o.time || "").trim()
      if (!date || !time) continue
      const endTime = o.endTime ? String(o.endTime).trim() : undefined
      slots.push({ date, time, ...(endTime ? { endTime } : {}) })
    }
    return slots
  } catch {
    return []
  }
}

export function serializeSessionsJson(sessions: TrainingSessionSlot[]): string {
  return JSON.stringify(
    sessions.map((s) => ({
      date: s.date,
      time: s.time,
      ...(s.endTime ? { endTime: s.endTime } : {}),
    })),
  )
}

/** כל מפגשי ההדרכה לתצוגת לו״ז (כולל מפגש ראשי אם אין sessions) */
export function leadCalendarSessions(lead: {
  date?: string
  time?: string
  endTime?: string
  sessions?: TrainingSessionSlot[]
  sessionsCount?: number | null
}): TrainingSessionSlot[] {
  if (lead.sessions && lead.sessions.length > 0) return lead.sessions
  if (lead.date && lead.time) {
    return [
      {
        date: lead.date,
        time: lead.time,
        endTime: lead.endTime,
      },
    ]
  }
  return []
}
