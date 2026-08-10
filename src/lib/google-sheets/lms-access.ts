import { prisma } from "@/lib/db"
import { formatCourseTypeLabel } from "@/lib/course-type"
import { getLmsEnvConfig } from "@/lib/lms"
import {
  buildLmsWelcomeEmailHtml,
  LMS_EMAIL_BRAND_NAME,
  lmsWelcomeEmailSubject,
} from "@/lib/lms-welcome-email"

export type LmsAccessParticipantPayload = {
  fullName: string
  idNumber: string
  email: string
  phone: string
  courseType: string
  participantId: string
  /** כתובת כניסה למערכת הלמידה */
  loginUrl?: string
  /** נושא המייל */
  emailSubject?: string
  /** HTML ממותג למייל ברוכים הבאים (ללא אמוג׳ים) */
  emailHtml?: string
}

export function getLmsAppsScriptUrl(): string | null {
  return process.env.LMS_GOOGLE_APPS_SCRIPT_URL?.trim() || null
}

function issuancePin(): string {
  return (
    process.env.CERTIFICATE_ISSUANCE_PIN?.trim() ||
    process.env.LMS_BACKUP_PIN?.trim() ||
    "214215444"
  )
}

async function resolveLmsLoginUrl(): Promise<string> {
  const fromEnv = getLmsEnvConfig().loginUrl
  if (fromEnv) return fromEnv
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { lmsLoginUrl: true, businessName: true },
  })
  return settings?.lmsLoginUrl?.trim() || ""
}

async function resolveBusinessName(): Promise<string> {
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { businessName: true },
  })
  const name = settings?.businessName?.trim()
  if (!name || name === "עזרה!" || name === "עזרא ורפואה" || name === "בריאות ורפואה") {
    return LMS_EMAIL_BRAND_NAME
  }
  return name
}

export async function loadLmsAccessParticipants(
  participantIds: string[],
): Promise<
  | { ok: true; participants: LmsAccessParticipantPayload[]; leadIds: string[] }
  | { ok: false; error: string }
> {
  const ids = [...new Set(participantIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) {
    return { ok: false, error: "לא נבחרו משתתפים" }
  }

  const rows = await prisma.participant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      fullName: true,
      idNumber: true,
      email: true,
      phone: true,
      leadId: true,
      lead: {
        select: {
          courseType: true,
          courseTypeOther: true,
        },
      },
    },
  })

  if (!rows.length) {
    return { ok: false, error: "המשתתפים לא נמצאו" }
  }

  const [loginUrl, businessName] = await Promise.all([
    resolveLmsLoginUrl(),
    resolveBusinessName(),
  ])

  const missing: string[] = []
  const participants: LmsAccessParticipantPayload[] = []

  for (const row of rows) {
    const idNumber = row.idNumber?.trim() || ""
    const email = row.email?.trim() || ""
    if (!idNumber || !email) {
      missing.push(
        `${row.fullName || row.id}: חסר ${[!idNumber && "ת״ז", !email && "דוא״ל"].filter(Boolean).join(" ו")}`,
      )
      continue
    }
    const fullName = row.fullName?.trim() || ""
    const courseLabel = formatCourseTypeLabel(row.lead?.courseType, {
      other: row.lead?.courseTypeOther,
    })
    const courseType = courseLabel === "קורס" ? "" : courseLabel
    participants.push({
      fullName,
      idNumber,
      email,
      phone: row.phone?.trim() || "",
      courseType,
      participantId: row.id,
      loginUrl,
      emailSubject: lmsWelcomeEmailSubject(businessName),
      emailHtml: buildLmsWelcomeEmailHtml({
        fullName,
        idNumber,
        loginUrl,
        businessName,
      }),
    })
  }

  if (missing.length && !participants.length) {
    return { ok: false, error: missing.join("; ") }
  }
  if (missing.length) {
    return {
      ok: false,
      error: `חלק מהמשתתפים חסרים פרטים: ${missing.join("; ")}`,
    }
  }

  return {
    ok: true,
    participants,
    leadIds: [...new Set(rows.map((r) => r.leadId))],
  }
}

/**
 * POST ל־LMS_GOOGLE_APPS_SCRIPT_URL עם המבנה:
 * { pin, participants: [{ fullName, idNumber, email, phone, courseType, participantId }] }
 */
export async function postLmsAccessToSheets(
  participants: LmsAccessParticipantPayload[],
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const webhookUrl = getLmsAppsScriptUrl()
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "חסר LMS_GOOGLE_APPS_SCRIPT_URL — הגדירו את כתובת ה-Web App ליצירת משתמשי LMS",
    }
  }

  const payload = {
    pin: issuancePin(),
    participants: participants.map((p) => ({
      fullName: p.fullName,
      idNumber: p.idNumber,
      email: p.email,
      phone: p.phone,
      courseType: p.courseType,
      participantId: p.participantId,
      // אופציונלי למייל ב-Apps Script
      ...(p.loginUrl ? { loginUrl: p.loginUrl } : {}),
      ...(p.emailSubject ? { emailSubject: p.emailSubject } : {}),
      ...(p.emailHtml ? { emailHtml: p.emailHtml } : {}),
    })),
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    })
    const text = await res.text()
    let scriptMessage = ""
    try {
      const json = JSON.parse(text) as {
        ok?: boolean
        success?: boolean
        message?: string
        error?: string
      }
      if (json.error) {
        return { ok: false, error: json.error }
      }
      scriptMessage = json.message || ""
      if (json.ok === false || json.success === false) {
        return {
          ok: false,
          error: scriptMessage || "הסקריפט ב-Sheets החזיר כישלון",
        }
      }
    } catch {
      if (!res.ok) {
        return {
          ok: false,
          error: text || `שגיאת Webhook (${res.status})`,
        }
      }
      scriptMessage = text.trim()
    }

    return {
      ok: true,
      message:
        scriptMessage ||
        "פרטי הגישה למערכת הלמידה נשלחו בהצלחה!",
    }
  } catch (err) {
    console.error("[postLmsAccessToSheets]", err)
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "שגיאה בשליחה ל-Google Sheets",
    }
  }
}
