import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  getLmsEnvConfig,
  lmsCredentialsFromPhone,
  lmsParticipantWhatsAppMessage,
  postLmsWebhookCreateUser,
  toLmsCourseCode,
} from "@/lib/lms"

export const dynamic = "force-dynamic"

type Body = {
  participantId?: string
  participantIds?: string[]
  leadId?: string
}

type RowResult = {
  participantId: string
  name: string
  ok: boolean
  error?: string
  username?: string
  loginUrl?: string
  whatsappMessage?: string
}

async function createForParticipant(participantId: string): Promise<RowResult> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      lead: {
        select: {
          id: true,
          courseType: true,
          courseTypeOther: true,
        },
      },
    },
  })

  if (!participant) {
    return {
      participantId,
      name: "",
      ok: false,
      error: "משתתף לא נמצא",
    }
  }

  const name = participant.fullName
  const creds = lmsCredentialsFromPhone(participant.phone)
  if (!creds) {
    return {
      participantId,
      name,
      ok: false,
      error: "חסר מספר טלפון תקין למשתתף",
    }
  }

  const courseType = toLmsCourseCode(
    participant.lead.courseType,
    participant.lead.courseTypeOther,
  )

  const webhook = await postLmsWebhookCreateUser({
    fullName: name,
    phone: creds.username,
    username: creds.username,
    password: creds.password,
    courseType,
  })

  if (!webhook.ok) {
    return {
      participantId,
      name,
      ok: false,
      error: webhook.error,
    }
  }

  await prisma.participant.update({
    where: { id: participantId },
    data: { hasLmsAccess: true },
  })

  const env = getLmsEnvConfig()
  const settings = await prisma.settings.findUnique({ where: { id: "default" } })
  const loginUrl =
    env.loginUrl ||
    settings?.lmsLoginUrl?.trim() ||
    "https://lms.example.com/login"

  return {
    participantId,
    name,
    ok: true,
    username: creds.username,
    loginUrl,
    whatsappMessage: lmsParticipantWhatsAppMessage({
      fullName: name,
      loginUrl,
    }),
  }
}

/**
 * POST /api/lms/create-user
 * פרוקסי ליצירת משתמשי LMS עבור מודרכים (לא איש הקשר של הליד).
 */
export async function POST(request: Request) {
  try {
    let body: Body
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json(
        { ok: false, error: "גוף הבקשה אינו JSON תקין" },
        { status: 400 },
      )
    }

    const ids = new Set<string>()
    if (body.participantId?.trim()) ids.add(body.participantId.trim())
    for (const id of body.participantIds || []) {
      if (id?.trim()) ids.add(id.trim())
    }

    if (ids.size === 0 && body.leadId?.trim()) {
      const rows = await prisma.participant.findMany({
        where: { leadId: body.leadId.trim() },
        select: { id: true },
      })
      for (const r of rows) ids.add(r.id)
    }

    if (ids.size === 0) {
      return NextResponse.json(
        { ok: false, error: "לא נבחרו משתתפים ליצירת משתמש LMS" },
        { status: 400 },
      )
    }

    const results: RowResult[] = []
    for (const id of ids) {
      results.push(await createForParticipant(id))
    }

    const succeeded = results.filter((r) => r.ok)
    const failed = results.filter((r) => !r.ok)

    if (succeeded.length > 0) {
      revalidatePath("/leads")
      revalidatePath("/")
    }

    return NextResponse.json({
      ok: failed.length === 0,
      data: {
        results,
        succeededCount: succeeded.length,
        failedCount: failed.length,
      },
      error:
        failed.length > 0
          ? failed.map((f) => `${f.name || f.participantId}: ${f.error}`).join("; ")
          : undefined,
    })
  } catch (err) {
    console.error("[POST /api/lms/create-user]", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "שגיאה ביצירת משתמש LMS",
      },
      { status: 500 },
    )
  }
}
