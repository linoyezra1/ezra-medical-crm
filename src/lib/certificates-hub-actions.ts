"use server"

/**
 * Server actions למודול ניהול תעודות (ניסיוני) — מבודד מזרימות קיימות.
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  DEFAULT_CERT_STATUS,
  DEFAULT_CERT_STATUS_OPTIONS,
  resolveCourseSubtypeLabel,
  resolveEffectiveCertifyingBody,
  resolveLastSessionDate,
  type CertificatesHubRow,
} from "@/lib/certificates-hub"
import { formatInJerusalem } from "@/lib/timezone"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function ensureDefaultStatusOptions() {
  const count = await prisma.certificateStatusOption.count()
  if (count > 0) return
  await prisma.certificateStatusOption.createMany({
    data: DEFAULT_CERT_STATUS_OPTIONS.map((o) => ({
      label: o.label,
      type: o.type,
    })),
    skipDuplicates: true,
  })
}

export async function listCertificateStatusOptionsAction(
  type?: "DIGITAL" | "PHYSICAL" | "BOTH",
): Promise<ActionResult<{ id: string; label: string; type: string }[]>> {
  try {
    await ensureDefaultStatusOptions()
    const rows = await prisma.certificateStatusOption.findMany({
      orderBy: { createdAt: "asc" },
    })
    const filtered = type
      ? rows.filter((r) => r.type === type || r.type === "BOTH")
      : rows
    return {
      ok: true,
      data: filtered.map((r) => ({
        id: r.id,
        label: r.label,
        type: r.type,
      })),
    }
  } catch (err) {
    console.error("[listCertificateStatusOptionsAction]", err)
    return { ok: false, error: "שגיאה בטעינת סטטוסים" }
  }
}

export async function createCertificateStatusOptionAction(input: {
  label: string
  type?: "DIGITAL" | "PHYSICAL" | "BOTH"
}): Promise<ActionResult<{ id: string; label: string; type: string }>> {
  const label = input.label.trim()
  if (!label) return { ok: false, error: "יש להזין שם סטטוס" }
  try {
    const existing = await prisma.certificateStatusOption.findUnique({
      where: { label },
    })
    if (existing) {
      return {
        ok: true,
        data: {
          id: existing.id,
          label: existing.label,
          type: existing.type,
        },
      }
    }
    const created = await prisma.certificateStatusOption.create({
      data: {
        label,
        type: input.type || "BOTH",
      },
    })
    revalidatePath("/certificates")
    return {
      ok: true,
      data: {
        id: created.id,
        label: created.label,
        type: created.type,
      },
    }
  } catch (err) {
    console.error("[createCertificateStatusOptionAction]", err)
    return { ok: false, error: "שגיאה בשמירת סטטוס חדש" }
  }
}

/** מודרכים זכאים לתעודה — נוכחות + גוף מסמיך */
export async function listEligibleCertificateParticipantsAction(): Promise<
  ActionResult<CertificatesHubRow[]>
> {
  try {
    await ensureDefaultStatusOptions()
    const rows = await prisma.participant.findMany({
      where: { attended: true },
      include: {
        lead: {
          select: {
            id: true,
            fullName: true,
            deliveryMethod: true,
            courseType: true,
            courseTypeOther: true,
            scheduledStart: true,
          },
        },
        certificateBatch: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const out: CertificatesHubRow[] = []
    for (const p of rows) {
      const body = resolveEffectiveCertifyingBody({
        participantBody: p.certifyingBody,
        isExternal: p.isExternal,
        leadDeliveryMethod: p.lead?.deliveryMethod,
      })
      if (!body) continue

      const leadDate = p.lead?.scheduledStart
        ? formatInJerusalem(p.lead.scheduledStart).date
        : undefined

      out.push({
        participantId: p.id,
        traineeId: p.traineeId || undefined,
        leadId: p.leadId,
        fullName: p.fullName,
        idNumber: p.idNumber,
        trainingTitle: p.organizerName || p.lead?.fullName || "הדרכה",
        lastSessionDate: resolveLastSessionDate({
          courseDate: p.courseDate,
          leadDate,
        }),
        certifyingBody: body,
        courseSubtype: resolveCourseSubtypeLabel({
          participantCourseType: p.courseType,
          leadCourseType: p.lead?.courseType,
          leadCourseTypeOther: p.lead?.courseTypeOther,
        }),
        digitalCertStatus: p.digitalCertStatus?.trim() || DEFAULT_CERT_STATUS,
        physicalCertStatus: p.physicalCertStatus?.trim() || DEFAULT_CERT_STATUS,
        batchId: p.certificateBatchId || undefined,
        batchName: p.certificateBatch?.name || undefined,
      })
    }

    return { ok: true, data: out }
  } catch (err) {
    console.error("[listEligibleCertificateParticipantsAction]", err)
    return { ok: false, error: "שגיאה בטעינת זכאים לתעודות" }
  }
}

export async function updateParticipantCertStatusesAction(input: {
  participantIds: string[]
  digitalCertStatus?: string
  physicalCertStatus?: string
}): Promise<ActionResult<{ updated: number }>> {
  const ids = [...new Set(input.participantIds.filter(Boolean))]
  if (!ids.length) return { ok: false, error: "לא נבחרו מודרכים" }

  const data: {
    digitalCertStatus?: string
    physicalCertStatus?: string
  } = {}
  if (input.digitalCertStatus !== undefined) {
    data.digitalCertStatus =
      input.digitalCertStatus.trim() || DEFAULT_CERT_STATUS
  }
  if (input.physicalCertStatus !== undefined) {
    data.physicalCertStatus =
      input.physicalCertStatus.trim() || DEFAULT_CERT_STATUS
  }
  if (!Object.keys(data).length) {
    return { ok: false, error: "לא נבחר סטטוס לעדכון" }
  }

  try {
    // שמירת סטטוס חדש במאגר אם צריך
    for (const label of [
      data.digitalCertStatus,
      data.physicalCertStatus,
    ].filter(Boolean) as string[]) {
      await createCertificateStatusOptionAction({ label, type: "BOTH" })
    }

    const result = await prisma.participant.updateMany({
      where: { id: { in: ids } },
      data,
    })
    revalidatePath("/certificates")
    return { ok: true, data: { updated: result.count } }
  } catch (err) {
    console.error("[updateParticipantCertStatusesAction]", err)
    return { ok: false, error: "שגיאה בעדכון סטטוסים" }
  }
}

export async function listCertificateBatchesAction(): Promise<
  ActionResult<
    {
      id: string
      name: string
      certifyingBody: string
      courseSubtype: string | null
      status: string
      count: number
    }[]
  >
> {
  try {
    const rows = await prisma.certificateBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { participants: true } } },
    })
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        certifyingBody: r.certifyingBody,
        courseSubtype: r.courseSubtype,
        status: r.status,
        count: r._count.participants,
      })),
    }
  } catch (err) {
    console.error("[listCertificateBatchesAction]", err)
    return { ok: false, error: "שגיאה בטעינת מחזורים" }
  }
}

export async function assignParticipantsToBatchAction(input: {
  participantIds: string[]
  batchId?: string
  newBatchName?: string
  certifyingBody?: string
  courseSubtype?: string
}): Promise<ActionResult<{ batchId: string; batchName: string }>> {
  const ids = [...new Set(input.participantIds.filter(Boolean))]
  if (!ids.length) return { ok: false, error: "לא נבחרו מודרכים" }

  try {
    let batchId = input.batchId?.trim() || ""
    let batchName = ""

    if (batchId) {
      const existing = await prisma.certificateBatch.findUnique({
        where: { id: batchId },
      })
      if (!existing) return { ok: false, error: "המחזור לא נמצא" }
      batchName = existing.name
    } else {
      const name = (input.newBatchName || "").trim()
      if (!name) return { ok: false, error: "יש להזין שם מחזור" }
      const created = await prisma.certificateBatch.create({
        data: {
          name,
          certifyingBody: (input.certifyingBody || "").trim() || "כללי",
          courseSubtype: input.courseSubtype?.trim() || null,
        },
      })
      batchId = created.id
      batchName = created.name
    }

    await prisma.participant.updateMany({
      where: { id: { in: ids } },
      data: { certificateBatchId: batchId },
    })
    revalidatePath("/certificates")
    return { ok: true, data: { batchId, batchName } }
  } catch (err) {
    console.error("[assignParticipantsToBatchAction]", err)
    return { ok: false, error: "שגיאה בשיוך למחזור" }
  }
}
