import type { Lead } from "./types"

/** מנקה מספר טלפון מתווים, רווחים, מקפים וקידומת בינ"ל */
export function cleanPhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "")
  if (p.startsWith("+972")) p = "0" + p.slice(4)
  else if (p.startsWith("972")) p = "0" + p.slice(3)
  p = p.replace(/\D/g, "")
  return p
}

export function formatPhone(phone: string): string {
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3)}`
  return phone
}

export function calcTotal(
  pricingType: Lead["pricingType"],
  pricePerUnit: number,
  participantsCount: number,
  globalPrice: number,
): number {
  if (pricingType === "per_participant") {
    return (pricePerUnit || 0) * (participantsCount || 0)
  }
  return globalPrice || 0
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n || 0)
}

export function formatDate(date?: string): string {
  if (!date) return "-"
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date))
}

/** מזהה חפיפה בטווח שעה לפני/אחרי הדרכה קיימת */
export function findConflicts(
  leads: Lead[],
  date: string,
  time: string,
  excludeId?: string,
): Lead[] {
  if (!date || !time) return []
  const target = new Date(`${date}T${time}`).getTime()
  const window = 60 * 60 * 1000 // שעה
  return leads.filter((l) => {
    if (l.id === excludeId) return false
    if (l.status === "lost" || l.status === "new") return false
    if (!l.date || !l.time) return false
    const t = new Date(`${l.date}T${l.time}`).getTime()
    return Math.abs(t - target) <= window
  })
}

export function whatsappSummary(lead: Lead): string {
  const lines = [
    `סיכום הדרכה - ${lead.name}`,
    `סוג קורס: ${lead.courseType}${lead.courseHours ? ` (${lead.courseHours} שעות)` : ""}`,
    lead.date ? `תאריך: ${formatDate(lead.date)}` : "תאריך: טרם נקבע",
    lead.time ? `שעה: ${lead.time}` : "שעה: טרם נקבעה",
    `כתובת: ${lead.address.street} ${lead.address.houseNumber}, ${lead.address.city}`,
    lead.instructor ? `מדריך: ${lead.instructor}` : "",
    lead.contactName ? `איש קשר: ${lead.contactName}` : "",
    `מספר משתתפים: ${lead.participantsCount}`,
  ].filter(Boolean)
  return lines.join("\n")
}

export function whatsappLink(phone: string, text: string): string {
  const clean = cleanPhone(phone)
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** בודק אילו שדות חסרים למעבר סטטוס */
export function missingForClose(lead: Partial<Lead>): string[] {
  const missing: string[] = []
  if (!lead.date) missing.push("תאריך")
  if (!lead.time) missing.push("שעה")
  if (!lead.address?.street || !lead.address?.city) missing.push("כתובת")
  return missing
}

export function requiresPhysicalAddress(lead: Lead): boolean {
  return lead.certificateDelivery === "mail" || lead.certificateDelivery === "physical"
}
