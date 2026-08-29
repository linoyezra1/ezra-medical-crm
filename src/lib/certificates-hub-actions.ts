"use server"

/**
 * Server actions למודול ניהול תעודות (ניסיוני).
 * סטטוסים מסונכרנים עם certificateEmailSent / certificateCardPrinted.
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  DEFAULT_CERT_STATUS,
  DEFAULT_CERT_STATUS_OPTIONS,
  formatTrainingTitlesList,
  hasPendingCertificateWork,
  isActivePreCertificateLeadStatus,
  isCertificatePhaseLeadStatus,
  resolveCourseSubtypeLabel,
  resolveDigitalCertStatus,
  resolveHubRoutingBody,
  resolveLastSessionDate,
  resolvePhysicalCertStatus,
  resolveTrainingTitle,
  type CertificatesHubRow,
} from "@/lib/certificates-hub"
import { normalizeCertifyingBody } from "@/lib/certifying-body"
import { formatInJerusalem } from "@/lib/timezone"
import { dbStatusToUi } from "@/lib/types"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function ensureDefaultStatusOptions() {
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

/**
 * זכאים לתעודה:
 * 1. נוכחות
 * 2. הדרכת המשתתף ב־«ממתין לתעודות» / «הסתיים»
 * 3. כל ההדרכות של אותו ת״ז (למעט אבודות) הגיעו לשלב תעודות — אין הדרכה פעילה/מתוזמנת
 */
export async function listEligibleCertificateParticipantsAction(): Promise<
  ActionResult<CertificatesHubRow[]>
> {
  try {
    await ensureDefaultStatusOptions()

    const candidates = await prisma.participant.findMany({
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
            courseStatus: true,
          },
        },
        trainee: {
          select: {
            id: true,
            certificateEmailSent: true,
            certificateCardPrinted: true,
          },
        },
        certificateBatch: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // רק משתתפים שההדרכה הנוכחית שלהם בשלב תעודות
    const phaseCandidates = candidates.filter((p) =>
      isCertificatePhaseLeadStatus(p.lead?.courseStatus),
    )

    const idNumbers = [
      ...new Set(
        phaseCandidates
          .map((p) => (p.idNumber || "").trim())
          .filter(Boolean),
      ),
    ]

    // כל ההרשמות לפי ת״ז — לבדיקת מחזור מלא + שמות הדרכות
    const siblings =
      idNumbers.length === 0
        ? []
        : await prisma.participant.findMany({
            where: { idNumber: { in: idNumbers } },
            select: {
              id: true,
              idNumber: true,
              courseDate: true,
              lead: {
                select: {
                  id: true,
                  fullName: true,
                  courseStatus: true,
                  scheduledStart: true,
                },
              },
            },
          })

    type SiblingInfo = {
      leadId: string
      title: string
      status: string
      lastDate: string
    }
    const byIdNumber = new Map<string, SiblingInfo[]>()
    for (const s of siblings) {
      const key = (s.idNumber || "").trim()
      if (!key || !s.lead) continue
      const leadDate = s.lead.scheduledStart
        ? formatInJerusalem(s.lead.scheduledStart).date
        : undefined
      const entry: SiblingInfo = {
        leadId: s.lead.id,
        title: resolveTrainingTitle(s.lead.fullName),
        status: s.lead.courseStatus,
        lastDate: resolveLastSessionDate({
          courseDate: s.courseDate,
          leadDate,
        }),
      }
      const list = byIdNumber.get(key)
      if (list) list.push(entry)
      else byIdNumber.set(key, [entry])
    }

    function isLostish(status: string): boolean {
      return dbStatusToUi(status) === "lost"
    }

    function idNumberFullyEligible(idNumber: string): boolean {
      const all = byIdNumber.get(idNumber) || []
      if (!all.length) return true
      // מתעלמים מהדרכות אבודות/מבוטלות
      const relevant = all.filter((t) => !isLostish(t.status) && t.status)
      if (!relevant.length) return false
      // אם יש הדרכה שעדיין פעילה/מתוזמנת — לא זכאי
      if (relevant.some((t) => isActivePreCertificateLeadStatus(t.status))) {
        return false
      }
      // כל הרלוונטיות חייבות להיות בשלב תעודות / הסתיים
      return relevant.every((t) => isCertificatePhaseLeadStatus(t.status))
    }

    const out: CertificatesHubRow[] = []
    const seenIdNumbers = new Set<string>()

    for (const p of phaseCandidates) {
      const idNumber = (p.idNumber || "").trim()
      if (!idNumber) continue
      if (!idNumberFullyEligible(idNumber)) continue

      // שורה אחת לכל ת״ז (מניעת כפילות בין מספר הדרכות)
      if (seenIdNumbers.has(idNumber)) continue
      seenIdNumbers.add(idNumber)

      const routing = resolveHubRoutingBody({
        participantBody: p.certifyingBody,
        isExternal: p.isExternal,
        leadDeliveryMethod: p.lead?.deliveryMethod,
      })

      const siblingsForId = byIdNumber.get(idNumber) || []
      const trainingTitle = formatTrainingTitlesList(
        siblingsForId
          .filter((t) => !isLostish(t.status))
          .map((t) => ({ title: t.title, dateKey: t.lastDate })),
      )

      const lastSessionDate = siblingsForId
        .map((t) => t.lastDate)
        .filter(Boolean)
        .sort()
        .at(-1) ||
        resolveLastSessionDate({
          courseDate: p.courseDate,
          leadDate: p.lead?.scheduledStart
            ? formatInJerusalem(p.lead.scheduledStart).date
            : undefined,
        })

      const emailSent = Boolean(p.trainee?.certificateEmailSent)
      const cardPrinted = Boolean(p.trainee?.certificateCardPrinted)

      if (
        !hasPendingCertificateWork({
          digitalCertStatus: p.digitalCertStatus,
          physicalCertStatus: p.physicalCertStatus,
          certificateEmailSent: emailSent,
          certificateCardPrinted: cardPrinted,
        })
      ) {
        continue
      }

      out.push({
        participantId: p.id,
        traineeId: p.traineeId || p.trainee?.id || undefined,
        leadId: p.leadId,
        fullName: p.fullName,
        idNumber,
        trainingTitle,
        lastSessionDate,
        certifyingBody: routing.body,
        courseSubtype: resolveCourseSubtypeLabel({
          participantCourseType: p.courseType,
          leadCourseType: p.lead?.courseType,
          leadCourseTypeOther: p.lead?.courseTypeOther,
        }),
        digitalCertStatus: resolveDigitalCertStatus({
          storedStatus: p.digitalCertStatus,
          certificateEmailSent: emailSent,
        }),
        physicalCertStatus: resolvePhysicalCertStatus({
          storedStatus: p.physicalCertStatus,
          certificateCardPrinted: cardPrinted,
        }),
        digitalCompleted: emailSent,
        physicalCompleted: cardPrinted,
        batchId: p.certificateBatchId || undefined,
        batchName: p.certificateBatch?.name || undefined,
        isExternal: Boolean(p.isExternal),
        unassignedBody: routing.unassigned,
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
  /** סימון ידני: תעודה דיגיטלית הושלמה (certificateEmailSent) */
  markDigitalCompleted?: boolean
  /** סימון ידני: תעודה פיזית הושלמה (certificateCardPrinted) */
  markPhysicalCompleted?: boolean
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
  if (!Object.keys(data).length && !input.markDigitalCompleted && !input.markPhysicalCompleted) {
    return { ok: false, error: "לא נבחר סטטוס לעדכון" }
  }

  try {
    for (const label of [
      data.digitalCertStatus,
      data.physicalCertStatus,
    ].filter(Boolean) as string[]) {
      await createCertificateStatusOptionAction({ label, type: "BOTH" })
    }

    const participants = await prisma.participant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        traineeId: true,
        idNumber: true,
        fullName: true,
        phone: true,
        email: true,
      },
    })

    // מעדכנים גם אחים לפי ת״ז — אותם דגלי Sheets לכל ההרשמות
    const idNumbers = [
      ...new Set(
        participants.map((p) => (p.idNumber || "").trim()).filter(Boolean),
      ),
    ]
    const siblingIds =
      idNumbers.length === 0
        ? ids
        : (
            await prisma.participant.findMany({
              where: { idNumber: { in: idNumbers } },
              select: { id: true },
            })
          ).map((p) => p.id)

    const allIds = [...new Set([...ids, ...siblingIds])]

    const result =
      Object.keys(data).length > 0
        ? await prisma.participant.updateMany({
            where: { id: { in: allIds } },
            data,
          })
        : { count: ids.length }

    if (input.markDigitalCompleted || input.markPhysicalCompleted) {
      for (const p of participants) {
        const traineePatch: {
          certificateEmailSent?: boolean
          certificateCardPrinted?: boolean
        } = {}
        if (input.markDigitalCompleted) {
          traineePatch.certificateEmailSent = true
        }
        if (input.markPhysicalCompleted) {
          traineePatch.certificateCardPrinted = true
        }

        if (p.traineeId) {
          await prisma.trainee.update({
            where: { id: p.traineeId },
            data: traineePatch,
          })
        } else {
          const idNumber = (p.idNumber || "").trim() || `hub-${p.id}`
          const trainee = await prisma.trainee.upsert({
            where: { idNumber },
            create: {
              fullName: p.fullName || "ללא שם",
              idNumber,
              phone: p.phone,
              email: p.email,
              certificateEmailSent: Boolean(input.markDigitalCompleted),
              certificateCardPrinted: Boolean(input.markPhysicalCompleted),
            },
            update: traineePatch,
          })
          await prisma.participant.updateMany({
            where: {
              OR: [
                { id: p.id },
                ...(p.idNumber ? [{ idNumber: p.idNumber.trim() }] : []),
              ],
            },
            data: { traineeId: trainee.id },
          })
        }
      }
    }

    revalidatePath("/certificates")
    revalidatePath("/clients")
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

/** שיוך גורף «תעודות דרך מי» — נשמר ב-participant + trainee (מקור האמת בכל המסכים) */
export async function assignParticipantsCertifyingBodyAction(input: {
  participantIds: string[]
  certifyingBody: string
}): Promise<ActionResult<{ updated: number; certifyingBody: string }>> {
  const ids = [...new Set(input.participantIds.filter(Boolean))]
  if (!ids.length) return { ok: false, error: "לא נבחרו מודרכים" }

  const body = normalizeCertifyingBody(input.certifyingBody)
  if (!body) return { ok: false, error: "יש לבחור גוף מסמיך תקין" }

  try {
    const participants = await prisma.participant.findMany({
      where: { id: { in: ids } },
      select: { id: true, idNumber: true, traineeId: true },
    })
    if (!participants.length) {
      return { ok: false, error: "לא נמצאו משתתפים" }
    }

    const idNumbers = [
      ...new Set(
        participants.map((p) => (p.idNumber || "").trim()).filter(Boolean),
      ),
    ]

    const targetIds =
      idNumbers.length === 0
        ? ids
        : (
            await prisma.participant.findMany({
              where: { idNumber: { in: idNumbers } },
              select: { id: true, traineeId: true },
            })
          ).map((p) => p.id)

    const allIds = [...new Set([...ids, ...targetIds])]

    const result = await prisma.participant.updateMany({
      where: { id: { in: allIds } },
      data: { certifyingBody: body },
    })

    const traineeIds = [
      ...new Set(
        (
          await prisma.participant.findMany({
            where: { id: { in: allIds } },
            select: { traineeId: true },
          })
        )
          .map((p) => p.traineeId)
          .filter(Boolean) as string[],
      ),
    ]

    if (traineeIds.length) {
      await prisma.trainee.updateMany({
        where: { id: { in: traineeIds } },
        data: { certifyingBody: body },
      })
    }

    revalidatePath("/certificates")
    revalidatePath("/clients")
    revalidatePath("/leads")
    return { ok: true, data: { updated: result.count, certifyingBody: body } }
  } catch (err) {
    console.error("[assignParticipantsCertifyingBodyAction]", err)
    return { ok: false, error: "שגיאה בשיוך גוף מסמיך" }
  }
}
