import { prisma } from "@/lib/db"
import { formatCourseTypeLabel, resolveParticipantCertificateCourseType } from "@/lib/course-type"
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

const LOG_PREFIX = "[LMS Dispatch]"

function logDispatchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`❌ CRM LMS Dispatch Error: ${message}`, err)
  return message
}

/** לוג payload מלא — emailHtml מקוצר כדי לא להציף את הלוגים */
function payloadForLog(payload: {
  pin: string
  participants: Array<Record<string, unknown>>
}) {
  return {
    pin: payload.pin,
    participants: payload.participants.map((p) => {
      const html = typeof p.emailHtml === "string" ? p.emailHtml : ""
      return {
        ...p,
        emailHtml: html
          ? `[html ${html.length} chars]`
          : p.emailHtml,
      }
    }),
  }
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
  console.info(`${LOG_PREFIX} load participants`, { requestedIds: ids })

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
      isExternal: true,
      courseType: true,
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
    const cert = resolveParticipantCertificateCourseType(row)
    const courseLabel = formatCourseTypeLabel(cert.courseType, {
      other: cert.courseTypeOther,
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
    console.warn(`${LOG_PREFIX} all participants missing fields`, { missing })
    return { ok: false, error: missing.join("; ") }
  }
  if (missing.length) {
    console.warn(`${LOG_PREFIX} some participants missing fields`, { missing })
    return {
      ok: false,
      error: `חלק מהמשתתפים חסרים פרטים: ${missing.join("; ")}`,
    }
  }

  console.info(`${LOG_PREFIX} loaded participants`, {
    count: participants.length,
    participantIds: participants.map((p) => p.participantId),
  })

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
): Promise<{ ok: true; message: string; rawBody?: string } | { ok: false; error: string }> {
  const webhookUrl = getLmsAppsScriptUrl()
  if (!webhookUrl) {
    const err =
      "חסר LMS_GOOGLE_APPS_SCRIPT_URL — הגדירו את כתובת ה-Web App ליצירת משתמשי LMS"
    console.error(`❌ CRM LMS Dispatch Error: ${err}`)
    return { ok: false, error: err }
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
      ...(p.loginUrl ? { loginUrl: p.loginUrl } : {}),
      ...(p.emailSubject ? { emailSubject: p.emailSubject } : {}),
      ...(p.emailHtml ? { emailHtml: p.emailHtml } : {}),
    })),
  }

  console.info(`${LOG_PREFIX} outgoing request`, {
    url: webhookUrl,
    envKey: "LMS_GOOGLE_APPS_SCRIPT_URL",
    pin: payload.pin,
    participantCount: payload.participants.length,
    payload: payloadForLog(payload),
  })

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    })

    const headersObj: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headersObj[key] = value
    })

    const text = await res.text()
    console.info(`${LOG_PREFIX} Apps Script response`, {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: headersObj,
      rawBody: text,
    })

    let scriptMessage = ""
    try {
      const json = JSON.parse(text) as {
        ok?: boolean
        success?: boolean
        message?: string
        error?: string
        processedCount?: number
      }
      console.info(`${LOG_PREFIX} Apps Script JSON`, {
        message: json.message,
        processedCount: json.processedCount,
        success: json.success,
        ok: json.ok,
        error: json.error,
        fullJson: json,
      })
      if (json.error) {
        console.error(`❌ CRM LMS Dispatch Error: ${json.error}`)
        return { ok: false, error: json.error }
      }
      scriptMessage = json.message || ""
      if (json.ok === false || json.success === false) {
        const failMsg = scriptMessage || "הסקריפט ב-Sheets החזיר כישלון"
        console.error(`❌ CRM LMS Dispatch Error: ${failMsg}`)
        return { ok: false, error: failMsg }
      }
    } catch (parseErr) {
      console.warn(`${LOG_PREFIX} response is not JSON — using raw text`, {
        parseError:
          parseErr instanceof Error ? parseErr.message : String(parseErr),
        rawBody: text,
      })
      if (!res.ok) {
        const failMsg = text || `שגיאת Webhook (${res.status})`
        console.error(`❌ CRM LMS Dispatch Error: ${failMsg}`)
        return { ok: false, error: failMsg }
      }
      scriptMessage = text.trim()
    }

    return {
      ok: true,
      message:
        scriptMessage ||
        "פרטי הגישה למערכת הלמידה נשלחו בהצלחה!",
      rawBody: text,
    }
  } catch (err) {
    const message = logDispatchError(err)
    return {
      ok: false,
      error: message || "שגיאה בשליחה ל-Google Sheets",
    }
  }
}
