"use server"

import { prisma } from "@/lib/db"
import {
  buildPilotCertificatesPdf,
  certificateValidUntil,
  pilotCertificateNumber,
  type PilotCertificateFields,
} from "@/lib/certificate-pdf-pilot"
import {
  certificateScopeForSheet,
  resolveParticipantCertificateCourseType,
} from "@/lib/course-type"
import { formatSheetDateDdMmYyyy } from "@/lib/google-sheets/sheet-dates"
import { formatInJerusalem } from "@/lib/timezone"

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

function verifyPin(pin: string): string | null {
  const expected = (
    process.env.CERTIFICATE_ISSUANCE_PIN?.trim() || "214215444"
  ).trim()
  if (!String(pin || "").trim() || String(pin).trim() !== expected) {
    return "קוד אבטחה שגוי"
  }
  return null
}

/**
 * פיילוט: מפיק PDF מקומי למשתתפים שנבחרו — ללא מייל וללא Google.
 */
export async function generatePilotCertificatesAction(input: {
  leadId?: string
  participantIds: string[]
  pin: string
}): Promise<ActionResult<{ pdfBase64: string; fileName: string; count: number }>> {
  const pinError = verifyPin(input.pin)
  if (pinError) {
    return { ok: false, error: pinError, code: "invalid_pin" }
  }

  const ids = [
    ...new Set(
      (input.participantIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ]
  if (!ids.length) {
    return { ok: false, error: "יש לבחור לפחות משתתף אחד" }
  }

  const leadIdFilter = String(input.leadId || "").trim() || undefined

  const participantSelect = {
    id: true,
    fullName: true,
    idNumber: true,
    courseDate: true,
    isExternal: true,
    courseType: true,
    lead: {
      select: {
        fullName: true,
        scheduledStart: true,
        courseType: true,
        courseTypeOther: true,
      },
    },
  } as const

  const ownedParticipants = await prisma.participant.findMany({
    where: {
      id: { in: ids },
      ...(leadIdFilter ? { leadId: leadIdFilter } : {}),
    },
    select: participantSelect,
    orderBy: { createdAt: "asc" },
  })

  const foundParticipantIds = new Set(ownedParticipants.map((p) => p.id))
  const remainingIds = ids.filter((id) => !foundParticipantIds.has(id))

  // ממסך מודרכים ייתכן שמגיעים trainee.id במקום participant.id
  const linkedFromTrainees =
    remainingIds.length && !leadIdFilter
      ? await prisma.participant.findMany({
          where: { traineeId: { in: remainingIds } },
          select: participantSelect,
          orderBy: { createdAt: "asc" },
        })
      : []

  const byId = new Map(
    [...ownedParticipants, ...linkedFromTrainees].map((p) => [p.id, p]),
  )
  const participants = [...byId.values()]

  if (!participants.length) {
    return {
      ok: false,
      error: leadIdFilter
        ? "לא נמצאו משתתפים תואמים בהדרכה זו"
        : "לא נמצאו משתתפים תואמים לבחירה",
    }
  }

  const pages: PilotCertificateFields[] = participants.map((p) => {
    const cert = resolveParticipantCertificateCourseType(p)
    const hoursScope = certificateScopeForSheet(
      cert.courseType,
      cert.courseTypeOther,
    )
    const courseDateRaw =
      p.courseDate?.trim() ||
      (p.lead?.scheduledStart
        ? formatInJerusalem(p.lead.scheduledStart).date || ""
        : "")
    const courseDate =
      formatSheetDateDdMmYyyy(courseDateRaw) || courseDateRaw || ""

    return {
      fullName: (p.fullName || "").trim() || "—",
      idNumber: (p.idNumber || "").trim(),
      courseDate,
      hoursScope: hoursScope || "",
      certificateNumber: pilotCertificateNumber({
        courseDate,
        participantId: p.id,
      }),
      validUntil: certificateValidUntil(courseDate),
    }
  })

  try {
    const pdfBytes = await buildPilotCertificatesPdf(pages)
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64")
    const stamp = new Date().toISOString().slice(0, 10)
    const fileName =
      pages.length === 1
        ? `תעודה-פיילוט-${pages[0].fullName.replace(/\s+/g, "-")}.pdf`
        : `תעודות-פיילוט-${pages.length}-${stamp}.pdf`

    return {
      ok: true,
      data: {
        pdfBase64,
        fileName,
        count: pages.length,
      },
    }
  } catch (err) {
    console.error("[generatePilotCertificatesAction]", err)
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "שגיאה בהפקת PDF הפיילוט",
    }
  }
}
