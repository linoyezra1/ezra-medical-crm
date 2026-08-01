import type { Lead as DbLead, Participant, Expense, Account, Contact, FollowUpTask, CourseAsset, Settings } from "@/generated/prisma/client";
import {
  dbEquipmentToUi,
  dbStatusToUi,
  type BusinessSettings,
  type Client,
  type EquipmentDeal,
  type Lead,
  type Task,
} from "@/lib/types";

type DbLeadFull = DbLead & {
  participants?: Participant[];
  expenses?: Expense[];
};

function splitDateTime(d: Date | null | undefined): { date?: string; time?: string } {
  if (!d) return {};
  const iso = new Date(d);
  if (Number.isNaN(iso.getTime())) return {};
  const date = iso.toISOString().slice(0, 10);
  const time = iso.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time };
}

function mapDelivery(method: string | null | undefined): Lead["certificateDelivery"] {
  if (method === "postal_mail") return "mail";
  if (method === "physical_print") return "physical";
  return "digital";
}

export function mapLead(db: DbLeadFull): Lead {
  const { date, time } = splitDateTime(db.scheduledStart);
  return {
    id: db.id,
    clientId: db.accountId || "",
    name: db.fullName,
    phone: db.phone,
    email: db.email || undefined,
    urgent: db.urgency === "urgent",
    status: dbStatusToUi(db.courseStatus),
    customerType: db.leadSource === "returning" ? "existing" : "new",
    courseType: db.courseTypeOther || db.courseType || "לא צוין",
    category: db.courseCategoryOther || db.courseCategory || "",
    pricingType: db.pricingModel === "per_participant" ? "per_participant" : "global",
    pricePerUnit: db.perParticipantRate ?? db.agreedPrice ?? 0,
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
    instructor: db.instructor || undefined,
    contactName: db.fullName,
    notes: db.notes || undefined,
    quoteSentAt: db.quoteSentAt?.toISOString(),
    kindergartenApproval: db.kindergartenApproved,
    participants: (db.participants || []).map((p) => ({
      id: p.id,
      name: p.fullName,
      idNumber: p.idNumber,
    })),
    expenses: (db.expenses || []).map((e) => ({
      id: e.id,
      type: e.type,
      amount: e.amount,
      hasReceipt: Boolean(e.receiptPath || e.notes),
      date: e.createdAt.toISOString(),
    })),
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
  const d = new Date(t.dueDate);
  return {
    id: t.id,
    title: t.title,
    date: d.toISOString().slice(0, 10),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
    assignee: t.assignee || "מכירות",
    note: t.notes || undefined,
    done: t.completed,
    relatedLeadId: t.leadId || undefined,
    type: t.title.includes("להתקשר") ? "callback" : t.title.includes("Net") ? "collection" : "general",
  };
}

export function mapSettings(
  settings: Settings | null,
  assets: CourseAsset[]
): BusinessSettings {
  return {
    businessName: settings?.businessName || "עזרא ורפואה",
    tiktokUrl: settings?.tiktokUrl || "",
    facebookUrl: settings?.facebookUrl || "",
    instagramUrl: settings?.instagramUrl || "",
    courses: assets.map((a) => ({
      type: a.courseType,
      hours: a.courseType.includes("22") ? 22 : a.courseType.includes("44") ? 44 : a.courseType.includes("60") ? 60 : 0,
      syllabusUrl: a.summaryText || "",
      presentationUrl: a.presentationUrl || "",
      bookletUrl: a.bookletUrl || "",
    })),
  };
}
