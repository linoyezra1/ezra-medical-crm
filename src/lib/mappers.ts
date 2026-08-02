import type {
  Lead as DbLead,
  Participant,
  Expense,
  Account,
  Contact,
  FollowUpTask,
  CourseAsset,
  Settings,
  Trainee as DbTrainee,
  InventoryItem as DbInventoryItem,
  InventoryComponent,
  TrainingSale as DbTrainingSale,
  Instructor as DbInstructor,
} from "@/generated/prisma/client";
import { DEFAULT_COURSES } from "@/lib/demo-data";
import { formatInJerusalem } from "@/lib/timezone";
import {
  dbEquipmentToUi,
  dbStatusToUi,
  type BusinessSettings,
  type Client,
  type EquipmentDeal,
  type InstructorProfile,
  type InventoryItem,
  type Lead,
  type Task,
  type Trainee,
  type TrainingSale,
} from "@/lib/types";

type DbLeadFull = DbLead & {
  participants?: Participant[];
  expenses?: Expense[];
  trainingSales?: (DbTrainingSale & { inventoryItem?: { name: string } | null })[];
  instructorRef?: DbInstructor | null;
};

export function mapInstructor(db: DbInstructor): InstructorProfile {
  return {
    id: db.id,
    name: db.name,
    fee: db.fee || 0,
    active: db.active,
  };
}

function splitDateTime(d: Date | null | undefined): { date?: string; time?: string } {
  return formatInJerusalem(d);
}

const CERTIFICATE_VIA = new Set(["עזרה ורפואה", "ניתאי", "יוסי"]);

function mapDelivery(method: string | null | undefined): Lead["certificateDelivery"] {
  if (method && CERTIFICATE_VIA.has(method)) {
    return method as Lead["certificateDelivery"];
  }
  // ערכים ישנים (דיגיטלי/דואר/הדפסה) → ברירת מחדל
  return "עזרה ורפואה";
}

export function mapLead(db: DbLeadFull): Lead {
  const { date, time } = splitDateTime(db.scheduledStart);
  const end = splitDateTime(db.scheduledEnd);
  return {
    id: db.id,
    clientId: db.accountId || "",
    name: db.fullName,
    phone: db.phone,
    phoneSecondary: (db as { phoneSecondary?: string | null }).phoneSecondary || undefined,
    email: db.email || undefined,
    status: dbStatusToUi(db.courseStatus),
    customerType: db.leadSource === "returning" ? "existing" : "new",
    courseType: db.courseType || db.courseTypeOther || "לא צוין",
    courseTypeOther: db.courseTypeOther || undefined,
    category: db.courseCategoryOther || db.courseCategory || "",
    pricingType: db.pricingModel === "per_participant" ? "per_participant" : "global",
    pricePerUnit: db.perParticipantRate ?? db.agreedPrice ?? 0,
    extraParticipantPrice: db.extraParticipantPrice ?? 50,
    participantsCount: db.expectedParticipants ?? db.participants?.length ?? 0,
    totalPrice: db.agreedPrice ?? 0,
    certificateDelivery: mapDelivery(db.deliveryMethod),
    address: {
      street: db.shippingStreet || db.location || "",
      houseNumber: db.shippingHouseNo || "",
      city: db.shippingCity || db.city || "",
      zip: db.shippingZip || undefined,
    },
    date,
    time,
    endTime: end.time,
    instructor: db.instructorRef?.name || db.instructor || undefined,
    instructorId: db.instructorId || db.instructorRef?.id || undefined,
    instructorFeeOverride:
      db.instructorFeeOverride != null ? db.instructorFeeOverride : undefined,
    contactName: db.fullName,
    notes: db.notes || undefined,
    quoteSentAt: db.quoteSentAt?.toISOString(),
    kindergartenApproval: db.kindergartenApproved,
    collectCertificateShipping: Boolean(db.collectCertificateShipping),
    participants: (db.participants || []).map((p) => ({
      id: p.id,
      name: p.fullName,
      idNumber: p.idNumber,
      organizerName: p.organizerName || undefined,
      courseDate: p.courseDate || undefined,
      email: p.email || undefined,
      phone: p.phone || undefined,
      satisfaction: p.satisfaction || undefined,
      feedback: p.feedback || undefined,
      kitInterest: p.kitInterest || undefined,
      shippingCity: p.shippingCity || undefined,
      shippingStreet: p.shippingStreet || undefined,
      shippingHouseNo: p.shippingHouseNo || undefined,
      shippingZip: p.shippingZip || undefined,
      attended: Boolean(p.attended),
      traineeId: p.traineeId || undefined,
    })),
    expenses: (db.expenses || []).map((e) => ({
      id: e.id,
      type: e.type,
      amount: e.amount,
      hasReceipt: Boolean(e.receiptPath || e.notes),
      date: e.createdAt.toISOString(),
    })),
    trainingSales: (db.trainingSales || []).map(
      (s): TrainingSale => ({
        id: s.id,
        inventoryItemId: s.inventoryItemId,
        itemName: s.inventoryItem?.name || "פריט",
        quantity: s.quantity,
        unitSellingPrice: s.unitSellingPrice,
        unitCostPrice: s.unitCostPrice,
        createdAt: s.createdAt.toISOString(),
      }),
    ),
    createdAt: db.createdAt.toISOString(),
    updatedAt: db.updatedAt.toISOString(),
    location: db.location || undefined,
    activityType: db.activityType,
    equipmentStatus: db.equipmentStatus,
    paymentTerms: db.paymentTerms,
    paymentStatus: db.paymentStatus,
    sessionsCount: db.sessionsCount,
    sessionDuration: db.sessionDuration,
    bookletRequired: db.bookletRequired,
    reason: db.reason,
  };
}

export function mapEquipmentDeal(db: DbLead): EquipmentDeal {
  return {
    id: db.id,
    clientId: db.accountId || "",
    title: db.reason || db.courseType || "עסקת ציוד",
    status: dbEquipmentToUi(db.equipmentStatus),
    amount: db.agreedPrice ?? 0,
    paymentTerms: db.paymentTerms === "net_30" || db.paymentTerms === "net_60" ? "net30" : "immediate",
    contactName: db.fullName,
    phone: db.phone,
    notes: db.notes || undefined,
    createdAt: db.createdAt.toISOString(),
    updatedAt: db.updatedAt.toISOString(),
  };
}

export function mapClient(
  account: Account & { contacts: Contact[]; leads?: DbLead[] }
): Client {
  const primary = account.contacts[0];
  return {
    id: account.id,
    name: account.name,
    phone: primary?.phone || "",
    city: account.city || undefined,
    contacts: account.contacts.map((c) => ({
      id: c.id,
      name: c.fullName,
      role: c.role || "",
      phone: c.phone,
      email: c.email || undefined,
    })),
    createdAt: account.createdAt.toISOString(),
  };
}

export function mapTask(t: FollowUpTask): Task {
  if (!t.dueDate) {
    return {
      id: t.id,
      title: t.title,
      date: "",
      time: undefined,
      assignee: t.assignee || "מכירות",
      note: t.notes || undefined,
      done: t.completed,
      relatedLeadId: t.leadId || undefined,
      type: t.title.includes("Net") ? "collection" : "general",
    };
  }
  const { date, time } = formatInJerusalem(t.dueDate);
  return {
    id: t.id,
    title: t.title,
    date: date || "",
    time,
    assignee: t.assignee || "מכירות",
    note: t.notes || undefined,
    done: t.completed,
    relatedLeadId: t.leadId || undefined,
    type: t.title.includes("Net") ? "collection" : "general",
  };
}

export function mapSettings(
  settings: Settings | null,
  assets: CourseAsset[]
): BusinessSettings {
  const fromDb = assets.map((a) => ({
    type: a.courseType,
    title: a.title || a.courseType,
    hours: a.hours || 0,
    audience: a.audience || undefined,
    durationText: a.durationText || undefined,
    natureText: a.natureText || undefined,
    contents: a.contents || undefined,
    pricingText: a.pricingText || undefined,
    summaryTemplate: a.summaryTemplate || undefined,
    syllabusUrl: a.syllabusUrl || "",
    presentationUrl: a.presentationUrl || "",
    bookletUrl: a.bookletUrl || "",
  }));

  // מיזוג עם ברירות מחדל – כדי שתבניות הסיכום יופיעו גם אם ב-DB חסרים שדות חדשים
  const courses = [
    ...DEFAULT_COURSES.map((def) => {
      const found = fromDb.find((a) => a.type === def.type);
      if (!found) return def;
      return {
        ...def,
        ...found,
        title: found.title && found.title !== found.type ? found.title : def.title,
        audience: found.audience || def.audience,
        durationText: found.durationText || def.durationText,
        natureText: found.natureText || def.natureText,
        contents: found.contents || def.contents,
        pricingText: found.pricingText || def.pricingText,
        summaryTemplate: found.summaryTemplate || def.summaryTemplate,
      };
    }),
    ...fromDb.filter((a) => !DEFAULT_COURSES.some((d) => d.type === a.type)),
  ];

  return {
    businessName: (() => {
      const name = settings?.businessName?.trim();
      if (
        !name ||
        name === "עזרא" ||
        name === "עזרה ורפואה" ||
        name === "עזרא ורפואה"
      ) {
        return "עזרה!";
      }
      return name;
    })(),
    websiteUrl:
      settings?.websiteUrl ||
      "https://www.ezra-medical.com/%D7%9B%D7%A0%D7%99%D7%A1%D7%94-%D7%9C%D7%AA%D7%9C%D7%9E%D7%99%D7%93%D7%99%D7%9D",
    googleReviewUrl: settings?.googleReviewUrl || "",
    tiktokUrl: settings?.tiktokUrl || "",
    facebookUrl: settings?.facebookUrl || "",
    instagramUrl: settings?.instagramUrl || "",
    courses,
  };
}

type DbTraineeFull = DbTrainee & {
  participants?: (Participant & {
    lead?: Pick<DbLead, "id" | "fullName" | "courseType" | "courseTypeOther"> | null;
  })[];
};

export function mapTrainee(db: DbTraineeFull): Trainee {
  return {
    id: db.id,
    fullName: db.fullName,
    idNumber: db.idNumber,
    phone: db.phone || undefined,
    email: db.email || undefined,
    certificateEmailSent: Boolean(db.certificateEmailSent),
    certificateCardPrinted: Boolean(db.certificateCardPrinted),
    notes: db.notes || undefined,
    trainings: (db.participants || []).map((p) => ({
      participantId: p.id,
      leadId: p.leadId,
      leadName: p.lead?.fullName || "הדרכה",
      organizerName: p.organizerName || undefined,
      courseDate: p.courseDate || undefined,
      courseType: p.lead?.courseTypeOther || p.lead?.courseType || undefined,
    })),
    createdAt: db.createdAt.toISOString(),
    updatedAt: db.updatedAt.toISOString(),
  };
}

type DbInventoryFull = DbInventoryItem & {
  components?: (InventoryComponent & {
    child?: Pick<DbInventoryItem, "id" | "name" | "costPrice"> | null;
  })[];
};

export function mapInventoryItem(db: DbInventoryFull): InventoryItem {
  return {
    id: db.id,
    name: db.name,
    category: db.category || "",
    sellingPrice: db.sellingPrice,
    costPrice: db.costPrice,
    supplierName: db.supplierName || "",
    isComposite: Boolean(db.isComposite),
    components: (db.components || []).map((c) => ({
      childId: c.childId,
      childName: c.child?.name || "רכיב",
      quantity: c.quantity,
      unitCostPrice: c.child?.costPrice ?? 0,
    })),
    createdAt: db.createdAt.toISOString(),
    updatedAt: db.updatedAt.toISOString(),
  };
}
