import { formatCourseTypeLabel } from "@/lib/course-type";
import { formatInJerusalem } from "@/lib/timezone";
import { toWhatsAppNumber } from "@/lib/utils";

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
  return formatCourseTypeLabel(lead.courseType, {
    other: lead.courseTypeOther,
  });
}

function formatDateTime(value: Date | string | null | undefined): { date: string; time: string } {
  const { date, time } = formatInJerusalem(value);
  if (!date || !time) return { date: "____", time: "____" };
  const [y, m, d] = date.split("-");
  return {
    date: `${d}/${m}/${y}`,
    time,
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

/** @deprecated השתמשו ב־lmsParticipantWhatsAppMessage מ־@/lib/lms */
export function lmsWelcomeMessage(params: {
  fullName: string;
  email?: string;
  password?: string;
  loginUrl: string;
}): string {
  const url = params.loginUrl.trim() || "קישור המערכת";
  return `היי ${params.fullName}, נוצר עבורך משתמש במערכת הלמידה. הקישור: ${url}. שם המשתמש והסיסמה שלך הם מספר הטלפון שלך.`;
}

export function shareSocialMessage(label: string, url: string): string {
  return `עקבו אחרינו ב${label}: ${url}`;
}
