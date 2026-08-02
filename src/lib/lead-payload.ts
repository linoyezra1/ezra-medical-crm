import { uiStatusToDb, type Lead } from "@/lib/types"

/** המרת Lead מ־UI ל־payload של Prisma / API */
export function leadToDbPayload(
  lead: Lead,
  patch: Partial<Lead> = {},
): Record<string, unknown> {
  const merged = { ...lead, ...patch }
  const date = merged.date
  const time = merged.time
  const endTime = merged.endTime

  const raw: Record<string, unknown> = {
    fullName: merged.name,
    phone: merged.phone,
    phoneSecondary: merged.phoneSecondary?.trim() || null,
    email: merged.email || null,
    urgency: merged.urgent ? "urgent" : "normal",
    courseStatus: uiStatusToDb(merged.status),
    courseType: merged.courseType,
    courseTypeOther: merged.courseTypeOther || null,
    courseCategory: merged.category,
    courseCategoryOther: merged.categoryOther || null,
    pricingModel:
      merged.pricingType === "per_participant" ? "per_participant" : "flat_rate",
    perParticipantRate:
      merged.pricingType === "per_participant" ? merged.pricePerUnit : null,
    extraParticipantPrice: merged.extraParticipantPrice ?? 50,
    expectedParticipants: merged.participantsCount,
    /** מחיר כולל / מחיר גלובלי — נשמר כ־agreedPrice */
    agreedPrice: merged.totalPrice,
    instructor: merged.instructor?.trim() || null,
    notes: merged.notes || null,
    kindergartenApproved: Boolean(merged.kindergartenApproval),
    collectCertificateShipping: Boolean(merged.collectCertificateShipping),
    shippingStreet: merged.address?.street ?? "",
    shippingHouseNo: merged.address?.houseNumber ?? "",
    shippingCity: merged.address?.city ?? "",
    shippingZip: merged.address?.zip || null,
    city: merged.address?.city ?? "",
    location:
      `${merged.address?.street ?? ""} ${merged.address?.houseNumber ?? ""}`.trim() ||
      merged.address?.city ||
      null,
    deliveryMethod: merged.certificateDelivery || "עזרה ורפואה",
    leadSource: merged.customerType === "existing" ? "returning" : "website",
  }

  if (patch.quoteSentAt || merged.quoteSentAt) {
    raw.quoteStatus = "sent"
  }

  if (date && time) {
    const start = new Date(`${date}T${time}`)
    if (!Number.isNaN(start.getTime())) {
      raw.scheduledStart = start.toISOString()
      if (endTime) {
        const end = new Date(`${date}T${endTime}`)
        if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) {
          raw.scheduledEnd = end.toISOString()
        } else {
          raw.scheduledEnd = new Date(
            start.getTime() + 60 * 60 * 1000,
          ).toISOString()
        }
      } else {
        raw.scheduledEnd = new Date(
          start.getTime() + 60 * 60 * 1000,
        ).toISOString()
      }
    }
  }

  return raw
}

/** האם ה־patch הוא עדכון משתתפים בלבד (לא שמירת טופס מלא) */
export function isParticipantsOnlyPatch(patch: Partial<Lead>): boolean {
  const keys = Object.keys(patch).filter((k) => k !== "updatedAt")
  return keys.length > 0 && keys.every((k) => k === "participants" || k === "participantsCount")
}

/** האם ה־patch הוא עדכון הוצאות בלבד */
export function isExpensesOnlyPatch(patch: Partial<Lead>): boolean {
  const keys = Object.keys(patch).filter((k) => k !== "updatedAt")
  return keys.length === 1 && keys[0] === "expenses"
}
