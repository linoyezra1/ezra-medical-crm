export const COURSE_STATUSES = [
  "new",
  "cold",
  "pending",
  "closed",
  "completed",
  "certificates_pending",
  "closed_won",
  "canceled",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  new: "חדש / בטיפול",
  cold: "ליד קר",
  pending: "ממתין לאישור",
  closed: "סגרנו נרשם ביומן",
  completed: "הדרכה בוצעה וממתינה לתעודות",
  certificates_pending: "הדרכה בוצעה וממתינה לתעודות",
  closed_won: "נסגר בהצלחה",
  canceled: "בוטל / אבוד",
};

export const EQUIPMENT_STATUSES = [
  "inquiry",
  "requisition_received",
  "supplied_invoiced",
  "pending_payment",
  "completed_paid",
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  inquiry: "פנייה",
  requisition_received: "הזמנה רשמית התקבלה",
  supplied_invoiced: "סופק + חשבונית",
  pending_payment: "ממתין לתשלום (Net+)",
  completed_paid: "הושלם (שולם)",
};

export const LEAD_SOURCES = [
  { value: "website", label: "אתר" },
  { value: "friends", label: "חברים" },
  { value: "facebook", label: "פייסבוק" },
  { value: "returning", label: "חוזר" },
  { value: "other", label: "אחר" },
] as const;

export const COURSE_TYPES = [
  { value: "8_hours", label: "8 שעות" },
  { value: "22_hours", label: "22 שעות" },
  { value: "44_hours", label: "44 שעות" },
  { value: "60_hours", label: "60 שעות" },
  { value: "paramedic", label: "חובשים" },
  { value: "other", label: "אחר" },
] as const;

export const COURSE_CATEGORIES = [
  { value: "yeshiva_students", label: "תלמידי ישיבות" },
  { value: "shipping_raspan", label: "ספנות / רספ״ן" },
  { value: "firearms", label: "נשק" },
  { value: "other", label: "אחר" },
] as const;

export const SESSION_DURATIONS = [
  { value: "2.5_hours", label: "2.5 שעות" },
  { value: "3_hours", label: "3 שעות" },
  { value: "4_hours", label: "4 שעות" },
  { value: "4+_hours", label: "4+ שעות" },
  { value: "other", label: "אחר" },
] as const;

export const PAYMENT_TERMS = [
  { value: "immediate", label: "מיידי" },
  { value: "net_30", label: "Net+30" },
  { value: "net_60", label: "Net+60" },
  { value: "other", label: "אחר" },
] as const;

export const PAYMENT_STATUSES = [
  { value: "pending_official_order", label: "ממתין להזמנה רשמית" },
  { value: "invoice_issued_pending_net", label: "חשבונית הונפקה – ממתין Net+" },
  { value: "paid_in_full", label: "שולם במלואו" },
] as const;

export const DELIVERY_METHODS = [
  { value: "עזרה ורפואה", label: "עזרה ורפואה" },
  { value: "ניתאי", label: "ניתאי" },
  { value: "יוסי", label: "יוסי" },
] as const;

export const EXPENSE_TYPES = [
  { value: "fuel", label: "דלק" },
  { value: "instructor", label: "מדריך" },
  { value: "medic", label: "אח" },
  { value: "other", label: "אחר" },
] as const;

export const ACTIVITY_TYPES = [
  { value: "course", label: "קורס" },
  { value: "equipment", label: "ציוד" },
  { value: "combined", label: "משולב" },
] as const;

/** Closed statuses that occupy calendar / conflict window */
export const SCHEDULED_STATUSES: CourseStatus[] = ["closed", "completed", "certificates_pending", "closed_won"];
