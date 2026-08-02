export type LeadStatus =
  | "new"
  | "closed"
  | "done"
  | "pending_certificates"
  | "completed"
  | "lost";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "ליד חדש / בטיפול",
  closed: "סגרנו נרשם ביומן",
  done: "הדרכה בוצעה",
  pending_certificates: "ממתין לתעודות",
  completed: "הושלם",
  lost: "אבוד / בוטל",
};

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "closed",
  "done",
  "pending_certificates",
  "completed",
];

/** DB courseStatus -> UI LeadStatus */
export function dbStatusToUi(status: string): LeadStatus {
  switch (status) {
    case "closed":
      return "closed";
    case "completed":
      return "done";
    case "certificates_pending":
      return "pending_certificates";
    case "closed_won":
      return "completed";
    case "canceled":
      return "lost";
    case "cold":
    case "pending":
    case "new":
    default:
      return "new";
  }
}

/** UI LeadStatus -> DB courseStatus */
export function uiStatusToDb(status: LeadStatus): string {
  switch (status) {
    case "closed":
      return "closed";
    case "done":
      return "completed";
    case "pending_certificates":
      return "certificates_pending";
    case "completed":
      return "closed_won";
    case "lost":
      return "canceled";
    case "new":
    default:
      return "new";
  }
}

export type PricingType = "per_participant" | "global";
/** תעודות דרך מי */
export type CertificateDelivery = "עזרה ורפואה" | "ניתאי" | "יוסי";

export const CERTIFICATE_VIA_OPTIONS: CertificateDelivery[] = [
  "עזרה ורפואה",
  "ניתאי",
  "יוסי",
];

export type CustomerType = "new" | "existing";

export interface Address {
  street: string;
  houseNumber: string;
  city: string;
  zip?: string;
}

export interface Participant {
  id: string;
  name: string;
  idNumber: string;
  organizerName?: string;
  courseDate?: string;
  email?: string;
  phone?: string;
  satisfaction?: string;
  feedback?: string;
  kitInterest?: string;
  shippingCity?: string;
  shippingStreet?: string;
  shippingHouseNo?: string;
  shippingZip?: string;
  attended?: boolean;
  /** נוצר משתמש LMS למודרך */
  hasLmsAccess?: boolean;
  traineeId?: string;
}

export interface TrainingSale {
  id: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unitSellingPrice: number;
  unitCostPrice: number;
  createdAt: string;
}

export interface InventoryComponentRef {
  childId: string;
  childName: string;
  quantity: number;
  unitCostPrice: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  supplierName: string;
  isComposite: boolean;
  components: InventoryComponentRef[];
  createdAt: string;
  updatedAt: string;
}

export interface TraineeTrainingRef {
  participantId: string;
  leadId: string;
  leadName: string;
  organizerName?: string;
  courseDate?: string;
  courseType?: string;
}

export interface Trainee {
  id: string;
  fullName: string;
  idNumber: string;
  phone?: string;
  email?: string;
  certificateEmailSent: boolean;
  certificateCardPrinted: boolean;
  notes?: string;
  trainings: TraineeTrainingRef[];
  createdAt: string;
  updatedAt: string;
}

export const SATISFACTION_OPTIONS = [
  "סביר",
  "מרוצה",
  "מרוצה מאוד",
  "המדריך היה מעולה",
] as const;

export const KIT_INTEREST_OPTIONS = [
  "לא, תודה",
  "כן, אשמח שתחזרו אליי",
] as const;

export interface Expense {
  id: string;
  type: string;
  amount: number;
  hasReceipt: boolean;
  date: string;
}

export interface Lead {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  /** טלפון משני אופציונלי */
  phoneSecondary?: string;
  email?: string;
  status: LeadStatus;
  customerType: CustomerType;
  courseType: string;
  /** טקסט חופשי כשנבחר "אחר" (או שם מותאם שנשמר ב-courseType) */
  courseTypeOther?: string;
  courseHours?: number;
  category: string;
  categoryOther?: string;
  pricingType: PricingType;
  pricePerUnit: number;
  /** תוספת למשתתף נוסף מעבר ל-25 — ברירת מחדל 50 ₪ */
  extraParticipantPrice?: number;
  participantsCount: number;
  totalPrice: number;
  certificateDelivery: CertificateDelivery;
  address: Address;
  date?: string;
  /** שעת התחלה HH:mm */
  time?: string;
  /** שעת סיום HH:mm */
  endTime?: string;
  instructor?: string;
  /** מזהה מדריך בפרופיל — מקור האמת לתעריף */
  instructorId?: string;
  /**
   * דריסת תעריף להדרכה זו בלבד.
   * אם לא הוגדר — משתמשים בתעריף החי מפרופיל המדריך.
   */
  instructorFeeOverride?: number;
  contactName?: string;
  notes?: string;
  quoteSentAt?: string;
  kindergartenApproval?: boolean;
  /** האם טופס המשתתפים הציבורי דורש כתובת למשלוח תעודה */
  collectCertificateShipping?: boolean;
  participants: Participant[];
  expenses: Expense[];
  trainingSales?: TrainingSale[];
  trainingIndex?: number;
  createdAt: string;
  updatedAt: string;
  /** raw DB fields for advanced edit */
  location?: string;
  activityType?: string;
  equipmentStatus?: string | null;
  paymentTerms?: string | null;
  paymentStatus?: string;
  sessionsCount?: number | null;
  sessionDuration?: string | null;
  bookletRequired?: boolean;
  reason?: string | null;
}

export type EquipmentStatus =
  | "inquiry"
  | "quote"
  | "order"
  | "invoice"
  | "paid";

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  inquiry: "פנייה",
  quote: "הצעה נשלחה",
  order: "הזמנה",
  invoice: "חשבונית הופקה",
  paid: "שולם",
};

export const EQUIPMENT_STATUS_ORDER: EquipmentStatus[] = [
  "inquiry",
  "quote",
  "order",
  "invoice",
  "paid",
];

export function dbEquipmentToUi(status: string | null | undefined): EquipmentStatus {
  switch (status) {
    case "requisition_received":
      return "order";
    case "supplied_invoiced":
      return "invoice";
    case "pending_payment":
      return "invoice";
    case "completed_paid":
      return "paid";
    case "inquiry":
    default:
      return "inquiry";
  }
}

export function uiEquipmentToDb(status: EquipmentStatus): string {
  switch (status) {
    case "quote":
      return "inquiry";
    case "order":
      return "requisition_received";
    case "invoice":
      return "supplied_invoiced";
    case "paid":
      return "completed_paid";
    case "inquiry":
    default:
      return "inquiry";
  }
}

export type PaymentTerms = "immediate" | "net30";

export interface EquipmentDeal {
  id: string;
  clientId: string;
  title: string;
  status: EquipmentStatus;
  amount: number;
  paymentTerms: PaymentTerms;
  contactName: string;
  phone: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  city?: string;
  contacts: Contact[];
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  /** ריק = משימה פתוחה ללא תאריך */
  date: string;
  time?: string;
  assignee: string;
  note?: string;
  done: boolean;
  relatedLeadId?: string;
  type: "callback" | "collection" | "general";
}

export interface CourseCatalogItem {
  type: string;
  title: string;
  hours: number;
  audience?: string;
  durationText?: string;
  natureText?: string;
  contents?: string;
  pricingText?: string;
  /** תבנית סיכום שיחה עם משתנים כמו {{name}}, {{price}}, {{contents}} */
  summaryTemplate?: string;
  syllabusUrl: string;
  presentationUrl: string;
  bookletUrl: string;
}

export interface BusinessSettings {
  businessName: string;
  websiteUrl?: string;
  googleReviewUrl?: string;
  tiktokUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  /** קישור התחברות LMS להודעות מודרכים */
  lmsLoginUrl?: string;
  courses: CourseCatalogItem[];
}

/** פרופיל מדריך במסד הנתונים */
export interface InstructorProfile {
  id: string;
  name: string;
  fee: number;
  active: boolean;
}
