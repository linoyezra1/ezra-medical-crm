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
  return `היי ${name}, נוצר עבורך משתמש במערכת הלמידה של עזרה ורפואה. הקישור: ${url}. שם המשתמש והסיסמה שלך הם מספר תעודת הזהות שלך.`
}

export type LmsWebhookPayload = {
  fullName: string
  phone: string
  username: string
  password: string
  courseType: string
}

/** נתיב webhook ידוע ב־LMS (fallback כש־LMS_API_URL מחזיר 404) */
export const LMS_WEBHOOK_FALLBACK_URL =
  "https://learningsystem-production.up.railway.app/api/webhooks/create-user"

function isEndpointNotFound(status: number, bodyText: string): boolean {
  if (status === 404) return true
  const lower = bodyText.toLowerCase()
  return (
    lower.includes("api endpoint not found") ||
    lower.includes("endpoint not found")
  )
}

async function postToLmsUrl(
  url: string,
  secret: string,
  payload: LmsWebhookPayload,
): Promise<{
  ok: boolean
  status: number
  detail: string
}> {
  const body = JSON.stringify({
    fullName: payload.fullName,
    phone: payload.phone,
    username: payload.username,
    password: payload.password,
    courseType: payload.courseType,
  })

  console.info(`[lms] POST → ${url}`)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": secret,
        "X-Webhook-Secret": secret,
      },
      body,
    })

    let detail = ""
    try {
      detail = (await res.text()).slice(0, 400)
    } catch {
      /* ignore */
    }

    if (res.status === 200 || res.status === 201) {
      console.info(`[lms] SUCCESS ← ${url} (status ${res.status})`)
      return { ok: true, status: res.status, detail }
    }

    console.warn(
      `[lms] FAILED ← ${url} (status ${res.status}) body=${detail || "(empty)"}`,
    )
    return { ok: false, status: res.status, detail }
  } catch (err) {
    console.error(`[lms] NETWORK ERROR ← ${url}`, err)
    return {
      ok: false,
      status: 502,
      detail: err instanceof Error ? err.message : "network error",
    }
  }
}

/** קריאה ל־LMS webhook עם מפתח API + fallback ל־404 */
export async function postLmsWebhookCreateUser(
  payload: LmsWebhookPayload,
): Promise<{ ok: true; status: number } | { ok: false; status: number; error: string }> {
  const { apiUrl, secret } = getLmsEnvConfig()
  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: "חסר LMS_WEBHOOK_SECRET בהגדרות הסביבה",
    }
  }

  const primary = apiUrl
  const fallback = LMS_WEBHOOK_FALLBACK_URL

  if (primary) {
    const first = await postToLmsUrl(primary, secret, payload)
    if (first.ok) {
      return { ok: true, status: first.status }
    }

    if (isEndpointNotFound(first.status, first.detail)) {
      console.warn(
        `[lms] primary 404/not-found — trying fallback ${fallback}`,
      )
      const second = await postToLmsUrl(fallback, secret, payload)
      if (second.ok) {
        return { ok: true, status: second.status }
      }
      return {
        ok: false,
        status: second.status,
        error: second.detail || `שגיאת LMS (${second.status})`,
      }
    }

    return {
      ok: false,
      status: first.status,
      error: first.detail || `שגיאת LMS (${first.status})`,
    }
  }

  console.warn(`[lms] LMS_API_URL empty — using fallback ${fallback}`)
  const only = await postToLmsUrl(fallback, secret, payload)
  if (only.ok) {
    return { ok: true, status: only.status }
  }
  return {
    ok: false,
    status: only.status,
    error: only.detail || `שגיאת LMS (${only.status})`,
  }
}
