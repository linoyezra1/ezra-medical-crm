export type LeadStatus =
  | "new"
  | "closed"
  | "pending_certificates"
  | "completed"
  | "lost";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "ליד חדש / בטיפול",
  closed: "סגרנו נרשם ביומן",
  pending_certificates: "הדרכה בוצעה וממתינה לתעודות",
  completed: "הסתיים",
  lost: "אבוד / בוטל",
};

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "closed",
  "pending_certificates",
  "completed",
];

/** סטטוס אחד אחורה בציר הזמן; null אם כבר בראשון / מחוץ לציר */
export function previousLeadStatus(status: LeadStatus): LeadStatus | null {
  const idx = LEAD_STATUS_ORDER.indexOf(status);
  if (idx <= 0) return null;
  return LEAD_STATUS_ORDER[idx - 1] ?? null;
}

export function canRollbackLeadStatus(status: LeadStatus): boolean {
  return previousLeadStatus(status) !== null;
}

/** DB courseStatus -> UI LeadStatus */
export function dbStatusToUi(status: string): LeadStatus {
  switch (status) {
    case "closed":
      return "closed";
    // Legacy DB `completed` (= old UI "done") merges into certificates_pending
    case "completed":
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
  /** קישור PDF לתעודה מ-Google Sheets (עמודה N) */
  certificateUrl?: string;
  /** משתתף חיצוני / מצטרף נוסף */
  isExternal?: boolean;
  /** ליד/אופציה — לא נספר בסכום הפעיל של ההדרכה */
  isLead?: boolean;
  /** סוג קורס אישי לתעודה (חיצוני) */
  courseType?: string;
  /** קטגוריה אישית לתעודה (חיצוני) */
  courseCategory?: string;
  /** מחיר לתשלום אישי */
  agreedPrice?: number;
  paymentStatus?: string;
  paymentDate?: string;
  paymentMethod?: string;
  paymentReceivedBy?: string;
  paymentReceiptIssued?: boolean;
  source?: string;
}

export interface TrainingSale {
  id: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unitSellingPrice: number;
  unitCostPrice: number;
  paymentMethod?: string;
  paymentStatus?: string;
  participantId?: string;
  participantName?: string;
  receiptIssued?: boolean;
  reportedByInstructorId?: string;
  reportedByInstructorName?: string;
  instructorCommissionAmount?: number;
  isInstructorReported?: boolean;
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
  /** כמות שהוכנסה למלאי */
  totalPurchased: number;
  /** יחידות שנמכרו (ישירות או כרכיב בתיק) */
  totalSold: number;
  /** מלאי נוכחי וירטואלי = totalPurchased − totalSold */
  currentStock: number;
  isComposite: boolean;
  /** רכיבי תיק (BOM) — מקביל ל־kitComponents */
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
  courseCategory?: string;
}

export interface Trainee {
  id: string;
  fullName: string;
  idNumber: string;
  phone?: string;
  email?: string;
  /** שויך כמשתתף חיצוני לפחות בהדרכה אחת */
  isExternal?: boolean;
  certificateEmailSent: boolean;
  certificateCardPrinted: boolean;
  certificateUrl?: string;
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
  /** איש קשר משני — משויך לטלפון המשני */
  contactNameSecondary?: string;
  notes?: string;
  quoteSentAt?: string;
  kindergartenApproval?: boolean;
  /** פרטי מעון — להתנהלות בטוחה / רענון עזרה ראשונה+התנהלות בטוחה */
  kindergartenManagerName?: string;
  kindergartenManagerPhone?: string;
  institutionSymbol?: string;
  /** YYYY-MM-DD */
  basicTrainingDate?: string;
  /** האם טופס המשתתפים הציבורי דורש כתובת למשלוח תעודה */
  collectCertificateShipping?: boolean;
  participants: Participant[];
  expenses: Expense[];
  trainingSales?: TrainingSale[];
  trainingIndex?: number;
  createdAt: string;
  updatedAt: string;
  /** נוצר על ידי — לינוי / יצחק */
  createdBy?: string;
  /** עודכן לאחרונה על ידי */
  lastUpdatedBy?: string;
  /** מי סגר את העסקה */
  closedBy?: string;
  assignedTo?: string;
  /** היסטוריית שינויי סטטוס */
  activityLogs?: ActivityLogEntry[];
  /** raw DB fields for advanced edit */
  location?: string;
  activityType?: string;
  equipmentStatus?: string | null;
  paymentTerms?: string | null;
  paymentStatus?: string;
  /** תאריך תשלום YYYY-MM-DD */
  paymentDate?: string;
  paymentMethod?: string;
  paymentReceivedBy?: string;
  paymentReceiptIssued?: boolean;
  /** קורס פרטי */
  isPrivateCourse?: boolean;
  sessionsCount?: number | null;
  /** מפגשים מרובים (כולל זום וכתובת למפגש) */
  sessions?: Array<{
    id?: string;
    date: string;
    time: string;
    endTime?: string;
    isZoom?: boolean;
    zoomLink?: string;
    city?: string;
    street?: string;
    houseNumber?: string;
  }>;
  sessionDuration?: string | null;
  bookletRequired?: boolean;
  reason?: string | null;
}

export interface ActivityLogEntry {
  id: string;
  performedBy: string;
  previousStatus?: string;
  newStatus: string;
  createdAt: string;
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
  phone?: string;
  username?: string;
  salesCommissionPercentage?: number;
  role?: string;
}
