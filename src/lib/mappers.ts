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
  ActivityLog as DbActivityLog,
  TrainingSession as DbTrainingSession,
} from "@/generated/prisma/client";
import { DEFAULT_COURSES } from "@/lib/demo-data";
import { resolveLeadCertifyingBody, normalizeCertifyingBody } from "@/lib/certifying-body";
import { currentStockOf } from "@/lib/inventory-stock";
import { parseSessionsJson, type TrainingSessionSlot } from "@/lib/payment";
import { formatInJerusalem } from "@/lib/timezone";
import {
  dbEquipmentToUi,
  dbStatusToUi,
  type ActivityLogEntry,
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
  trainingSessions?: DbTrainingSession[];
  expenses?: Expense[];
  trainingSales?: (DbTrainingSale & {
    inventoryItem?: { name: string } | null;
    participant?: { id: string; fullName: string } | null;
  })[];
  instructorRef?: DbInstructor | null;
  activityLogs?: DbActivityLog[];
};

export function mapInstructor(db: DbInstructor): InstructorProfile {
  return {
    id: db.id,
    name: db.name,
    fee: db.fee || 0,
    active: db.active,
    phone: (db as { phone?: string | null }).phone?.trim() || undefined,
    username: (db as { username?: string | null }).username?.trim() || undefined,
    salesCommissionPercentage:
      (db as { salesCommissionPercentage?: number | null })
        .salesCommissionPercentage ?? 0,
    role: (db as { role?: string | null }).role || "INSTRUCTOR",
    allowedEquipmentIds: Array.isArray(
      (db as { allowedEquipmentIds?: string[] | null }).allowedEquipmentIds,
    )
      ? ((db as { allowedEquipmentIds: string[] }).allowedEquipmentIds || []).filter(
          Boolean,
        )
      : [],
  };
}

export function mapActivityLog(db: DbActivityLog): ActivityLogEntry {
  return {
    id: db.id,
    performedBy: db.performedBy,
    previousStatus: db.previousStatus || undefined,
    newStatus: db.newStatus,
    createdAt: db.createdAt.toISOString(),
  };
}

function splitDateTime(d: Date | null | undefined): { date?: string; time?: string } {
  return formatInJerusalem(d);
}

function mapDelivery(method: string | null | undefined): Lead["certificateDelivery"] {
  return resolveLeadCertifyingBody(method);
}

function mapTrainingSessions(
  db: DbLeadFull,
): TrainingSessionSlot[] {
  if (db.trainingSessions && db.trainingSessions.length > 0) {
    return db.trainingSessions.map((s) => ({
      id: s.id,
      date: s.date,
      time: s.startTime,
      endTime: s.endTime || undefined,
      isZoom: Boolean(s.isZoom),
      zoomLink:
        (s as { zoomLink?: string | null }).zoomLink?.trim() || undefined,
      city: s.city || undefined,
      street: s.street || undefined,
      houseNumber: s.houseNumber || undefined,
    }));
  }
  const fromJson = parseSessionsJson(db.sessionsJson);
  if (fromJson.length > 0) {
    return fromJson.map((s) => ({
      ...s,
      city: s.city || db.shippingCity || db.city || undefined,
      street: s.street || db.shippingStreet || undefined,
      houseNumber: s.houseNumber || db.shippingHouseNo || undefined,
    }));
  }
  return [];
}

export function mapLead(db: DbLeadFull): Lead {
  const { date, time } = splitDateTime(db.scheduledStart);
  const end = splitDateTime(db.scheduledEnd);
  const sessions = mapTrainingSessions(db);
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
    contactName: db.contactName?.trim() || undefined,
    contactNameSecondary: db.contactNameSecondary?.trim() || undefined,
    notes: db.notes || undefined,
    quoteSentAt: db.quoteSentAt?.toISOString(),
    kindergartenApproval: db.kindergartenApproved,
    kindergartenManagerName:
      (db as { kindergartenManagerName?: string | null }).kindergartenManagerName ||
      undefined,
    kindergartenManagerPhone:
      (db as { kindergartenManagerPhone?: string | null }).kindergartenManagerPhone ||
      undefined,
    institutionSymbol:
      (db as { institutionSymbol?: string | null }).institutionSymbol || undefined,
    basicTrainingDate:
      (db as { basicTrainingDate?: string | null }).basicTrainingDate || undefined,
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
      hasLmsAccess: Boolean(p.hasLmsAccess),
      traineeId: p.traineeId || undefined,
      certificateUrl: p.certificateUrl || undefined,
      isExternal: Boolean(
        (p as { isExternal?: boolean }).isExternal,
      ),
      isLead: Boolean((p as { isLead?: boolean }).isLead),
      courseType: (p as { courseType?: string | null }).courseType || undefined,
      courseCategory:
        (p as { courseCategory?: string | null }).courseCategory || undefined,
      agreedPrice:
        (p as { agreedPrice?: number | null }).agreedPrice != null
          ? Number((p as { agreedPrice?: number | null }).agreedPrice)
          : undefined,
      paymentStatus:
        (p as { paymentStatus?: string | null }).paymentStatus || undefined,
      paymentDate: (p as { paymentDate?: Date | null }).paymentDate
        ? formatInJerusalem((p as { paymentDate?: Date | null }).paymentDate!)
            .date
        : undefined,
      paymentMethod:
        (p as { paymentMethod?: string | null }).paymentMethod || undefined,
      paymentReceivedBy:
        (p as { paymentReceivedBy?: string | null }).paymentReceivedBy ||
        undefined,
      paymentReceiptIssued: Boolean(
        (p as { paymentReceiptIssued?: boolean }).paymentReceiptIssued,
      ),
      source:
        (p as { source?: string | null }).source || "manual",
      notes: (p as { notes?: string | null }).notes || undefined,
      certifyingBody:
        normalizeCertifyingBody(
          (p as { certifyingBody?: string | null }).certifyingBody,
        ) || undefined,
      examScore:
        (p as { examScore?: number | null }).examScore != null
          ? Number((p as { examScore?: number | null }).examScore)
          : undefined,
      examPassed: Boolean((p as { examPassed?: boolean }).examPassed),
      examCompletedAt: (p as { examCompletedAt?: Date | null }).examCompletedAt
        ? (p as { examCompletedAt: Date }).examCompletedAt.toISOString()
        : undefined,
      examDraftAnswers: (() => {
        const raw = (p as { examDraftAnswers?: unknown }).examDraftAnswers
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) out[k] = v
        }
        return Object.keys(out).length ? out : undefined
      })(),
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
        paymentMethod: s.paymentMethod || undefined,
        paymentStatus: s.paymentStatus || undefined,
        participantId:
          (s as { participantId?: string | null }).participantId ||
          s.participant?.id ||
          undefined,
        participantName: s.participant?.fullName || undefined,
        receiptIssued: Boolean(
          (s as { receiptIssued?: boolean }).receiptIssued,
        ),
        reportedByInstructorId:
          (s as { reportedByInstructorId?: string | null })
            .reportedByInstructorId || undefined,
        reportedByInstructorName:
          (s as { reportedByInstructor?: { name?: string } | null })
            .reportedByInstructor?.name || undefined,
        instructorCommissionAmount:
          (s as { instructorCommissionAmount?: number | null })
            .instructorCommissionAmount ?? 0,
        isInstructorReported: Boolean(
          (s as { isInstructorReported?: boolean }).isInstructorReported,
        ),
        createdAt: s.createdAt.toISOString(),
      }),
    ),
    createdAt: db.createdAt.toISOString(),
    updatedAt: db.updatedAt.toISOString(),
    createdBy: db.createdBy || undefined,
    lastUpdatedBy: db.lastUpdatedBy || undefined,
    closedBy: db.closedBy || undefined,
    assignedTo: db.assignedTo || undefined,
    activityLogs: (db.activityLogs || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map(mapActivityLog),
    location: db.location || undefined,
    activityType: db.activityType,
    equipmentStatus: db.equipmentStatus,
    paymentTerms: db.paymentTerms,
    paymentStatus: db.paymentStatus,
    paymentDate: db.paymentDate
      ? formatInJerusalem(db.paymentDate).date
      : undefined,
    paymentMethod: db.paymentMethod || undefined,
    paymentReceivedBy: db.paymentReceivedBy || undefined,
    paymentReceiptIssued: Boolean(db.paymentReceiptIssued),
    isPrivateCourse: Boolean(db.isPrivateCourse),
    sessionsCount: db.sessionsCount ?? (sessions.length || null),
    sessions,
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
      // "עזרה!" היה מיתוג ישן ללא משמעות — מוחלף בברירת מחדל
      if (!name || name === "עזרה!" || name === "עזרא ורפואה") return "עזרה ורפואה";
      return name;
    })(),
    websiteUrl:
      settings?.websiteUrl ||
      "https://www.ezra-medical.com/%D7%9B%D7%A0%D7%99%D7%A1%D7%94-%D7%9C%D7%AA%D7%9C%D7%9E%D7%99%D7%93%D7%99%D7%9D",
    googleReviewUrl: settings?.googleReviewUrl || "",
    tiktokUrl: settings?.tiktokUrl || "",
    facebookUrl: settings?.facebookUrl || "",
    instagramUrl: settings?.instagramUrl || "",
    lmsLoginUrl: settings?.lmsLoginUrl || "",
    courses,
  };
}

type DbTraineeFull = DbTrainee & {
  participants?: (Participant & {
    certificateUrl?: string | null
    courseType?: string | null
    courseCategory?: string | null
    isExternal?: boolean | null
    lead?: Pick<
      DbLead,
      | "id"
      | "fullName"
      | "courseType"
      | "courseTypeOther"
      | "courseCategory"
      | "courseCategoryOther"
    > | null;
  })[];
};

export function mapTrainee(db: DbTraineeFull): Trainee {
  const fromParticipant = (db.participants || []).find(
    (p) => p.certificateUrl?.trim(),
  )?.certificateUrl
  const isExternal = (db.participants || []).some((p) =>
    Boolean((p as { isExternal?: boolean }).isExternal),
  )
  return {
    id: db.id,
    fullName: db.fullName,
    idNumber: db.idNumber,
    phone: db.phone || undefined,
    email: db.email || undefined,
    isExternal,
    certificateEmailSent: Boolean(db.certificateEmailSent),
    certificateCardPrinted: Boolean(db.certificateCardPrinted),
    certificateUrl: db.certificateUrl || fromParticipant || undefined,
    notes: db.notes || undefined,
    certifyingBody: normalizeCertifyingBody(
      (db as { certifyingBody?: string | null }).certifyingBody,
    ),
    examScore: db.examScore != null ? Number(db.examScore) : undefined,
    examPassed: Boolean(db.examPassed),
    examCompletedAt: db.examCompletedAt
      ? db.examCompletedAt.toISOString()
      : undefined,
    examDraftAnswers: (() => {
      const raw = db.examDraftAnswers
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v
      }
      return Object.keys(out).length ? out : undefined
    })(),
    trainings: (db.participants || []).map((p) => ({
      participantId: p.id,
      leadId: p.leadId,
      leadName: p.lead?.fullName || "הדרכה",
      organizerName: p.organizerName || undefined,
      courseDate: p.courseDate || undefined,
      courseType:
        (p.courseType || "").trim() ||
        p.lead?.courseTypeOther ||
        p.lead?.courseType ||
        undefined,
      courseCategory:
        (p.courseCategory || "").trim() ||
        p.lead?.courseCategoryOther ||
        p.lead?.courseCategory ||
        undefined,
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
  const isComposite = Boolean(db.isComposite);
  const totalPurchased = Number(db.totalPurchased) || 0;
  const totalSold = Number(db.totalSold) || 0;
  const packageTotalCost =
    db.packageTotalCost != null ? Number(db.packageTotalCost) : undefined;
  const packageUnitsCount =
    db.packageUnitsCount != null ? Number(db.packageUnitsCount) : undefined;
  return {
    id: db.id,
    name: db.name,
    category: db.category || "",
    sellingPrice: db.sellingPrice,
    costPrice: db.costPrice,
    supplierName: db.supplierName || "",
    totalPurchased,
    totalSold,
    currentStock: currentStockOf({
      totalPurchased,
      totalSold,
      isComposite,
    }),
    isComposite,
    isPackagePurchase: Boolean(db.isPackagePurchase),
    packageTotalCost:
      packageTotalCost != null && Number.isFinite(packageTotalCost)
        ? packageTotalCost
        : undefined,
    packageUnitsCount:
      packageUnitsCount != null && Number.isFinite(packageUnitsCount)
        ? packageUnitsCount
        : undefined,
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
