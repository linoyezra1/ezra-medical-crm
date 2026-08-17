/** סטטוס תשלום שולם במלואו */
export const PAID_PAYMENT_STATUS = "paid_in_full"

/** קידומת משימת גבייה אוטומטית */
export const UNPAID_PAYMENT_TASK_PREFIX = "גביית תשלום להדרכה"

export const PAYMENT_METHODS = [
  { value: "bit", label: "ביט" },
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
  { value: "paybox", label: "פייבוקס" },
  { value: "check", label: "צ'ק" },
  { value: "other", label: "אחר" },
] as const

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"]

/** מכירת ציוד בהדרכה — שולם / ממתין לתשלום */
export const TRAINING_SALE_PAID = "paid"
export const TRAINING_SALE_PENDING_PAYMENT = "PENDING_PAYMENT"

/** כותרת בסיס (תאימות לאחור) */
export const TRAINING_SALE_UNPAID_TASK_TITLE =
  "מעקב גביית תשלום עבור מכירה בהדרכה"

export function unpaidTrainingSaleTaskTitle(
  productName: string,
  totalAmount: number,
): string {
  const name = productName.trim() || "פריט"
  const amount = Number.isFinite(totalAmount) ? totalAmount : 0
  return `מעקב גביית תשלום - ${name} (${amount} ₪)`
}

export function unpaidTrainingSaleTaskNotes(opts: {
  productName: string
  totalAmount: number
  trainingName: string
  clientName: string
}): string {
  const product = opts.productName.trim() || "פריט"
  const amount = Number.isFinite(opts.totalAmount) ? opts.totalAmount : 0
  const training = opts.trainingName.trim() || "—"
  const client = opts.clientName.trim() || "—"
  return [
    `מה נמכר (Product/Item): ${product}`,
    `סכום לתשלום (Amount Pending): ${amount} ₪`,
    `שם ההדרכה (Training/Course Name): ${training}`,
    `שם הלקוח (Client/Lead Name): ${client}`,
  ].join("\n")
}

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
  id?: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  endTime?: string
  isZoom?: boolean
  city?: string
  street?: string
  houseNumber?: string
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
      const time = String(o.time || o.startTime || "").trim()
      if (!date || !time) continue
      const endTime = o.endTime ? String(o.endTime).trim() : undefined
      const isZoom = Boolean(o.isZoom)
      const city = o.city != null ? String(o.city).trim() : undefined
      const street = o.street != null ? String(o.street).trim() : undefined
      const houseNumber =
        o.houseNumber != null ? String(o.houseNumber).trim() : undefined
      slots.push({
        date,
        time,
        ...(endTime ? { endTime } : {}),
        ...(isZoom ? { isZoom: true } : {}),
        ...(city ? { city } : {}),
        ...(street ? { street } : {}),
        ...(houseNumber ? { houseNumber } : {}),
      })
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
      ...(s.isZoom ? { isZoom: true } : {}),
      ...(s.city ? { city: s.city } : {}),
      ...(s.street ? { street: s.street } : {}),
      ...(s.houseNumber ? { houseNumber: s.houseNumber } : {}),
    })),
  )
}

/** מוסיף 4 שעות לשעת התחלה HH:mm */
export function addHoursToTime(time: string, hours = 4): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return time
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return time
  const total = (h * 60 + min + hours * 60) % (24 * 60)
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`
}

/** כל מפגשי ההדרכה לתצוגת לו״ז (כולל מפגש ראשי אם אין sessions) */
export function leadCalendarSessions(lead: {
  date?: string
  time?: string
  endTime?: string
  sessions?: TrainingSessionSlot[]
  sessionsCount?: number | null
  address?: { city?: string; street?: string; houseNumber?: string }
}): TrainingSessionSlot[] {
  if (lead.sessions && lead.sessions.length > 0) return lead.sessions
  if (lead.date && lead.time) {
    return [
      {
        date: lead.date,
        time: lead.time,
        endTime: lead.endTime,
        city: lead.address?.city,
        street: lead.address?.street,
        houseNumber: lead.address?.houseNumber,
      },
    ]
  }
  return []
}

/** מיקום מפגש ליומן / תצוגה — זום בלי כתובת רחוב */
export function sessionLocationLabel(s: {
  isZoom?: boolean
  city?: string
  street?: string
  houseNumber?: string
}): string {
  if (s.isZoom) return "זום"
  return [s.street, s.houseNumber, s.city]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" ")
}

/** האם כל המפגשים (או המפגש היחיד) הם זום */
export function leadSessionsAreAllZoom(lead: {
  sessions?: TrainingSessionSlot[]
}): boolean {
  const sessions = lead.sessions
  if (!sessions || sessions.length === 0) return false
  return sessions.every((s) => Boolean(s.isZoom))
}

export function leadHasAnyZoomSession(lead: {
  sessions?: TrainingSessionSlot[]
}): boolean {
  return Boolean(lead.sessions?.some((s) => s.isZoom))
}
