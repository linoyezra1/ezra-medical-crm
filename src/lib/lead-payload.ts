import { serializeSessionsJson } from "@/lib/payment"
import { jerusalemLocalToISO } from "@/lib/timezone"
import {
  isInstructorUnassigned,
  UNASSIGNED_INSTRUCTOR,
} from "@/lib/instructor"
import { resolveLeadCertifyingBody } from "@/lib/certifying-body"
import {
  calcTripEscortAgreedPrice,
  isTripEscortLead,
  serializeTripBillingJson,
  TRIP_ESCORT_ACTIVITY,
} from "@/lib/trip-escort"
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
  const unassigned = isInstructorUnassigned(merged.instructor)

  const raw: Record<string, unknown> = {
    fullName: merged.name,
    contactName: merged.contactName?.trim() || null,
    contactNameSecondary: merged.contactNameSecondary?.trim() || null,
    phone: merged.phone,
    phoneSecondary: merged.phoneSecondary?.trim() || null,
    email: merged.email || null,
    courseStatus: uiStatusToDb(merged.status),
    courseType: merged.isPrivateCourse ? null : merged.courseType,
    courseTypeOther: merged.isPrivateCourse
      ? null
      : merged.courseTypeOther || null,
    courseCategory: merged.category,
    courseCategoryOther: merged.categoryOther || null,
    activityType: isTripEscortLead(merged)
      ? TRIP_ESCORT_ACTIVITY
      : merged.activityType || "course",
    pricingModel:
      merged.pricingType === "per_participant" ? "per_participant" : "flat_rate",
    perParticipantRate:
      merged.pricingType === "per_participant" ? merged.pricePerUnit : null,
    extraParticipantPrice: merged.extraParticipantPrice ?? 50,
    expectedParticipants: merged.participantsCount,
    tripBillingJson: isTripEscortLead(merged)
      ? serializeTripBillingJson(merged.tripBillingLines || [])
      : null,
    /** מחיר כולל / מחיר גלובלי / ליווי טיול — נשמר כ־agreedPrice */
    agreedPrice: isTripEscortLead(merged)
      ? calcTripEscortAgreedPrice(
          merged.tripBillingLines || [],
          merged.sessions?.length || merged.sessionsCount || 0,
        )
      : merged.totalPrice,
    instructor: unassigned
      ? UNASSIGNED_INSTRUCTOR
      : merged.instructor?.trim() || null,
    instructorId: unassigned ? null : merged.instructorId || null,
    instructorFeeOverride:
      merged.instructorFeeOverride != null &&
      Number.isFinite(merged.instructorFeeOverride)
        ? Number(merged.instructorFeeOverride)
        : null,
    notes: merged.notes || null,
    kindergartenApproved: Boolean(merged.kindergartenApproval),
    kindergartenManagerName:
      merged.kindergartenManagerName?.trim() || null,
    kindergartenManagerPhone:
      merged.kindergartenManagerPhone?.trim() || null,
    institutionSymbol: merged.institutionSymbol?.trim() || null,
    basicTrainingDate: merged.basicTrainingDate?.trim() || null,
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
    deliveryMethod: resolveLeadCertifyingBody(merged.certificateDelivery),
    leadSource: merged.customerType === "existing" ? "returning" : "website",
    paymentStatus: merged.paymentStatus || undefined,
    paymentDate: merged.paymentDate || undefined,
    paymentMethod: merged.paymentMethod || undefined,
    paymentReceivedBy: merged.paymentReceivedBy || undefined,
    paymentReceiptIssued: Boolean(merged.paymentReceiptIssued),
    isPrivateCourse: Boolean(merged.isPrivateCourse),
    sessionsCount: merged.sessionsCount ?? null,
    sessionsJson:
      merged.sessions && merged.sessions.length > 0
        ? serializeSessionsJson(merged.sessions)
        : null,
  }

  if (patch.quoteSentAt || merged.quoteSentAt) {
    raw.quoteStatus = "sent"
  }

  if (date && time) {
    // שעון קיר ישראל → ISO UTC (בלי תלות באזור המכונה)
    const startIso = jerusalemLocalToISO(date, time)
    const startMs = Date.parse(startIso)
    if (!Number.isNaN(startMs)) {
      raw.scheduledStart = startIso
      if (endTime) {
        const endIso = jerusalemLocalToISO(date, endTime)
        const endMs = Date.parse(endIso)
        if (!Number.isNaN(endMs) && endMs > startMs) {
          raw.scheduledEnd = endIso
        } else {
          raw.scheduledEnd = new Date(startMs + 60 * 60 * 1000).toISOString()
        }
      } else {
        raw.scheduledEnd = new Date(startMs + 60 * 60 * 1000).toISOString()
      }
    }
  } else {
    // ניקוי תאריך/שעה בטופס — מאפסים ב-DB (למשל אחרי שכפול בלי תאריך חדש)
    raw.scheduledStart = null
    raw.scheduledEnd = null
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
