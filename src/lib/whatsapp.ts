import { COURSE_TYPES } from "@/lib/constants";
import { labelOf, toWhatsAppNumber } from "@/lib/utils";

export type WhatsAppLeadContext = {
  fullName: string;
  phone: string;
  courseType?: string | null;
  courseTypeOther?: string | null;
  scheduledStart?: Date | string | null;
  location?: string | null;
  city?: string | null;
};

function courseTypeLabel(lead: WhatsAppLeadContext): string {
  if (lead.courseType === "other" && lead.courseTypeOther) return lead.courseTypeOther;
  return labelOf(COURSE_TYPES, lead.courseType, "קורס עזרה ראשונה");
}

function formatDateTime(value: Date | string | null | undefined): { date: string; time: string } {
  if (!value) return { date: "____", time: "____" };
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return { date: "____", time: "____" };
  return {
    date: d.toLocaleDateString("he-IL"),
    time: d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const num = toWhatsAppNumber(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function summaryMessage(lead: WhatsAppLeadContext): string {
  const { date, time } = formatDateTime(lead.scheduledStart);
  const address = [lead.location, lead.city].filter(Boolean).join(", ") || "____";
  return `שלום ${lead.fullName}, סיכום הפרטים שסוכמו: ${courseTypeLabel(lead)} בתאריך ${date} בשעה ${time}, מיקום: ${address}. מצורף סילבוס.`;
}

export function lmsWelcomeMessage(params: {
  fullName: string;
  email: string;
  password: string;
  loginUrl: string;
}): string {
  return `שלום ${params.fullName}, חשבון ה-LMS שלך מוכן! שם משתמש: ${params.email}, סיסמה ראשונית: ${params.password}. התחברות: ${params.loginUrl}`;
}

export function shareSocialMessage(label: string, url: string): string {
  return `עקבו אחרינו ב${label}: ${url}`;
}
