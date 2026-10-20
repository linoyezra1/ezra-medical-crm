/**
 * מע״ר מלווה טיול — תמחור לקוח ושיבוץ צוות.
 */

export const TRIP_ESCORT_ACTIVITY = "trip_escort" as const

export const TRIP_ESCORT_ROLES = ["mear", "medic", "paramedic"] as const

export type TripEscortRole = (typeof TRIP_ESCORT_ROLES)[number]

export const TRIP_ESCORT_ROLE_LABELS: Record<TripEscortRole, string> = {
  mear: "מע״ר",
  medic: "חובש",
  paramedic: "פראמדיק",
}

export const TRIP_ESCORT_EXPENSE_TYPE = "שכר מלווה"

export type TripBillingLine = {
  role: TripEscortRole
  count: number
  dailyRate: number
}

export type TripEscortStaffRow = {
  id: string
  leadId: string
  fullName: string
  phone: string
  idNumber: string
  role: TripEscortRole | string
  assignedSessionIds: string[]
  payAmount: number
  notes?: string
  expenseId?: string
}

export function isTripEscortActivity(
  activityType: string | null | undefined,
): boolean {
  return (activityType || "").trim() === TRIP_ESCORT_ACTIVITY
}

export function isTripEscortLead(lead: {
  activityType?: string | null
}): boolean {
  return isTripEscortActivity(lead.activityType)
}

export function isTripEscortRole(value: string): value is TripEscortRole {
  return (TRIP_ESCORT_ROLES as readonly string[]).includes(value)
}

export function tripEscortRoleLabel(role: string): string {
  if (isTripEscortRole(role)) return TRIP_ESCORT_ROLE_LABELS[role]
  return role || "—"
}

export function calcTripEscortAgreedPrice(
  lines: TripBillingLine[],
  dayCount: number,
): number {
  const days = Math.max(0, Number(dayCount) || 0)
  if (days <= 0) return 0
  let total = 0
  for (const line of lines) {
    const count = Math.max(0, Number(line.count) || 0)
    const rate = Math.max(0, Number(line.dailyRate) || 0)
    total += count * rate * days
  }
  return Math.round(total * 100) / 100
}

export function calcStaffPayFromDaily(
  dailyRate: number,
  assignedDayCount: number,
): number {
  const days = Math.max(0, Number(assignedDayCount) || 0)
  const rate = Math.max(0, Number(dailyRate) || 0)
  return Math.round(rate * days * 100) / 100
}

export function parseTripBillingJson(
  raw: string | null | undefined,
): TripBillingLine[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: TripBillingLine[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const row = item as Record<string, unknown>
      const role = String(row.role || "").trim()
      if (!isTripEscortRole(role)) continue
      const count = Number(row.count)
      const dailyRate = Number(row.dailyRate)
      if (!Number.isFinite(count) || count <= 0) continue
      if (!Number.isFinite(dailyRate) || dailyRate < 0) continue
      out.push({ role, count, dailyRate })
    }
    return out
  } catch {
    return []
  }
}

export function serializeTripBillingJson(lines: TripBillingLine[]): string | null {
  const cleaned = lines
    .filter(
      (l) =>
        isTripEscortRole(l.role) &&
        Number(l.count) > 0 &&
        Number.isFinite(Number(l.dailyRate)),
    )
    .map((l) => ({
      role: l.role,
      count: Number(l.count),
      dailyRate: Number(l.dailyRate),
    }))
  if (!cleaned.length) return null
  return JSON.stringify(cleaned)
}

export function parseAssignedSessionIds(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean)
  }
  if (typeof raw === "string") {
    try {
      return parseAssignedSessionIds(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return []
}
