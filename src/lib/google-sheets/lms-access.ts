import { prisma } from "@/lib/db"

export type LmsAccessParticipantPayload = {
  fullName: string
  idNumber: string
  email: string
  phone: string
  participantId: string
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
    },
  })

  if (!rows.length) {
    return { ok: false, error: "המשתתפים לא נמצאו" }
  }

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
    participants.push({
      fullName: row.fullName?.trim() || "",
      idNumber,
      email,
      phone: row.phone?.trim() || "",
      participantId: row.id,
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

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pin: issuancePin(),
        participants,
      }),
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
