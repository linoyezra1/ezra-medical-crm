import { sanitizePhone } from "@/lib/utils"

export type LmsConfig = {
  apiUrl: string
  secret: string
  loginUrl: string
}

/** קורא הגדרות LMS ממשתני סביבה (עם נפילה ל־login URL מ־Settings בצד הקורא) */
export function getLmsEnvConfig(): LmsConfig {
  return {
    apiUrl: (process.env.LMS_API_URL || "").trim(),
    secret: (process.env.LMS_WEBHOOK_SECRET || "").trim(),
    loginUrl: (process.env.LMS_LOGIN_URL || "").trim(),
  }
}

/** טלפון כשם משתמש/סיסמה — סטנדרטיזציה ל־05xxxxxxxx */
export function lmsCredentialsFromPhone(phone: string | null | undefined): {
  username: string
  password: string
} | null {
  const username = sanitizePhone(phone || "")
  if (!username || username.length < 9) return null
  return { username, password: username }
}

/**
 * מיפוי סוג קורס ב־CRM לקוד LMS.
 * שומר סלג קנוני (44_hours וכו') כשניתן.
 */
export function toLmsCourseCode(
  courseType: string | null | undefined,
  courseTypeOther?: string | null,
): string {
  const raw = (courseType || "").trim()
  if (!raw) return courseTypeOther?.trim() || "other"

  const labelToSlug: Record<string, string> = {
    "44 שעות": "44_hours",
    "22 שעות": "22_hours",
    "60 שעות": "60_hours",
    חובשים: "paramedic",
    חובש: "paramedic",
    "החייאת תינוקות": "infant_cpr",
    "החייאת תינוקות (גן)": "infant_kindergarten",
    אחר: "other",
  }

  if (labelToSlug[raw]) return labelToSlug[raw]

  const knownSlugs = new Set([
    "44_hours",
    "22_hours",
    "60_hours",
    "paramedic",
    "infant_cpr",
    "infant_kindergarten",
    "other",
  ])
  if (knownSlugs.has(raw)) return raw

  const normalized = raw.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_")
  const aliases: Record<string, string> = {
    hours_44: "44_hours",
    "44hours": "44_hours",
    hours_22: "22_hours",
    hours_60: "60_hours",
    medics: "paramedic",
    medic: "paramedic",
  }
  if (aliases[normalized]) return aliases[normalized]
  if (knownSlugs.has(normalized)) return normalized

  return courseTypeOther?.trim() || raw
}

export function lmsParticipantWhatsAppMessage(params: {
  fullName: string
  loginUrl: string
}): string {
  const name = params.fullName.trim() || "מודרך"
  const url = params.loginUrl.trim() || "קישור המערכת"
  return `היי ${name}, נוצר עבורך משתמש במערכת הלמידה. הקישור: ${url}. שם המשתמש והסיסמה שלך הם מספר הטלפון שלך.`
}

export type LmsWebhookPayload = {
  fullName: string
  phone: string
  username: string
  password: string
  courseType: string
}

/** קריאה ל־LMS webhook עם מפתח API */
export async function postLmsWebhookCreateUser(
  payload: LmsWebhookPayload,
): Promise<{ ok: true; status: number } | { ok: false; status: number; error: string }> {
  const { apiUrl, secret } = getLmsEnvConfig()
  if (!apiUrl) {
    return {
      ok: false,
      status: 500,
      error: "חסר LMS_API_URL בהגדרות הסביבה",
    }
  }
  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: "חסר LMS_WEBHOOK_SECRET בהגדרות הסביבה",
    }
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": secret,
      },
      body: JSON.stringify(payload),
    })

    if (res.status === 200 || res.status === 201) {
      return { ok: true, status: res.status }
    }

    let detail = ""
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      error: detail || `שגיאת LMS (${res.status})`,
    }
  } catch (err) {
    console.error("[lms] webhook failed", err)
    return {
      ok: false,
      status: 502,
      error: "לא ניתן להתחבר לשרת ה־LMS",
    }
  }
}
