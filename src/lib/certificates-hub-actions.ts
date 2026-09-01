"use server"

/**
 * Server actions למודול ניהול תעודות (ניסיוני).
 * סטטוסים מסונכרנים עם certificateEmailSent / certificateCardPrinted.
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  DEFAULT_CERT_STATUS,
  formatTrainingTitlesList,
  hasPendingCertificateWork,
  isActivePreCertificateLeadStatus,
  isCertificatePhaseLeadStatus,
  resolveCourseSubtypeLabel,
  resolveDigitalCertStatus,
  resolveHubCategoryLabel,
  resolveHubRoutingBody,
  resolveLastSessionDate,
  resolvePhysicalCertStatus,
  resolveTrainingTitle,
  sortCertificatesHubRows,
  normalizeBatchName,
  type CertificatesHubRow,
} from "@/lib/certificates-hub"
import {
  ensureCertificateStatusRegistry,
  loadCertificateStatusRegistry,
  resolveCertificateStatusLabel,
} from "@/lib/certificate-status-registry"
import { normalizeCertifyingBody } from "@/lib/certifying-body"
import { formatInJerusalem } from "@/lib/timezone"
import { dbStatusToUi } from "@/lib/types"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function ensureDefaultStatusOptions() {
  await ensureCertificateStatusRegistry()
}

export async function listCertificateStatusOptionsAction(
  type?: "DIGITAL" | "PHYSICAL" | "BOTH",
): Promise<
  ActionResult<
    { id: string; label: string; type: string; isCompleted: boolean }[]
  >
> {
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
        isCompleted: Boolean(r.isCompleted),
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
  isCompleted?: boolean
}): Promise<
  ActionResult<{
    id: string
    label: string
    type: string
    isCompleted: boolean
  }>
> {
  const label = input.label.trim()
  if (!label) return { ok: false, error: "יש להזין שם סטטוס" }
  try {
    const existing = await prisma.certificateStatusOption.findUnique({
      where: { label },
    })
    if (existing) {
      if (
        input.isCompleted !== undefined &&
        Boolean(existing.isCompleted) !== Boolean(input.isCompleted)
      ) {
        const updated = await prisma.certificateStatusOption.update({
          where: { id: existing.id },
          data: { isCompleted: Boolean(input.isCompleted) },
        })
        revalidatePath("/certificates")
        return {
          ok: true,
          data: {
            id: updated.id,
            label: updated.label,
            type: updated.type,
            isCompleted: Boolean(updated.isCompleted),
          },
        }
      }
      return {
        ok: true,
        data: {
          id: existing.id,
          label: existing.label,
          type: existing.type,
          isCompleted: Boolean(existing.isCompleted),
        },
      }
    }
    const created = await prisma.certificateStatusOption.create({
      data: {
        label,
        type: input.type || "BOTH",
        isCompleted: Boolean(input.isCompleted),
      },
    })
    revalidatePath("/certificates")
    return {
      ok: true,
      data: {
        id: created.id,
        label: created.label,
        type: created.type,
        isCompleted: Boolean(created.isCompleted),
      },
    }
  } catch (err) {
    console.error("[createCertificateStatusOptionAction]", err)
    return { ok: false, error: "שגיאה בשמירת סטטוס חדש" }
  }
}

async function syncTraineeFlagsForParticipants(
  participants: {
    id: string
    traineeId: string | null
    idNumber: string | null
    fullName: string
    phone: string | null
    email: string | null
    digitalCertStatus: string | null
    physicalCertStatus: string | null
  }[],
  patch: {
    digitalCertStatus?: string
    digitalIsCompleted?: boolean
    physicalCertStatus?: string
    physicalIsCompleted?: boolean
  },
): Promise<void> {
  const byTrainee = new Map<
    string,
    {
      traineeId: string | null
      idNumber: string
      fullName: string
      phone: string | null
      email: string | null
      emailSent?: boolean
      cardPrinted?: boolean
    }
  >()

  for (const p of participants) {
    const idNumber = (p.idNumber || "").trim() || `hub-${p.id}`
    const key = p.traineeId || idNumber
    const row = byTrainee.get(key) || {
      traineeId: p.traineeId,
      idNumber,
      fullName: p.fullName || "ללא שם",
      phone: p.phone,
      email: p.email,
    }

    if (
      patch.digitalCertStatus !== undefined &&
      (p.digitalCertStatus || "").trim() === patch.digitalCertStatus &&
      patch.digitalIsCompleted !== undefined
    ) {
      row.emailSent = patch.digitalIsCompleted
    }
    if (
      patch.physicalCertStatus !== undefined &&
      (p.physicalCertStatus || "").trim() === patch.physicalCertStatus &&
      patch.physicalIsCompleted !== undefined
    ) {
      row.cardPrinted = patch.physicalIsCompleted
    }
    byTrainee.set(key, row)
  }

  for (const row of byTrainee.values()) {
    const traineePatch: {
      certificateEmailSent?: boolean
      certificateCardPrinted?: boolean
    } = {}
    if (row.emailSent !== undefined) {
      traineePatch.certificateEmailSent = row.emailSent
    }
    if (row.cardPrinted !== undefined) {
      traineePatch.certificateCardPrinted = row.cardPrinted
    }
    if (!Object.keys(traineePatch).length) continue

    if (row.traineeId) {
      await prisma.trainee.update({
        where: { id: row.traineeId },
        data: traineePatch,
      })
    } else {
      await prisma.trainee.upsert({
        where: { idNumber: row.idNumber },
        create: {
          fullName: row.fullName,
          idNumber: row.idNumber,
          phone: row.phone,
          email: row.email,
          certificateEmailSent: row.emailSent ?? false,
          certificateCardPrinted: row.cardPrinted ?? false,
        },
        update: traineePatch,
      })
    }
  }
}

/** עדכון סטטוס קיים + סנכרון דגלים לכל המשתתפים עם אותו label */
export async function updateCertificateStatusOptionAction(input: {
  id: string
  label?: string
  isCompleted?: boolean
}): Promise<
  ActionResult<{
    id: string
    label: string
    isCompleted: boolean
    participantsUpdated: number
  }>
> {
  const id = input.id.trim()
  if (!id) return { ok: false, error: "חסר מזהה סטטוס" }

  try {
    const existing = await prisma.certificateStatusOption.findUnique({
      where: { id },
    })
    if (!existing) return { ok: false, error: "סטטוס לא נמצא" }

    const nextLabel = input.label?.trim() || existing.label
    const nextCompleted =
      input.isCompleted !== undefined
        ? Boolean(input.isCompleted)
        : Boolean(existing.isCompleted)

    if (!nextLabel) return { ok: false, error: "יש להזין שם סטטוס" }

    if (nextLabel !== existing.label) {
      const conflict = await prisma.certificateStatusOption.findUnique({
        where: { label: nextLabel },
      })
      if (conflict && conflict.id !== id) {
        return { ok: false, error: "סטטוס בשם זה כבר קיים" }
      }
    }

    const affectsDigital =
      existing.type === "DIGITAL" || existing.type === "BOTH"
    const affectsPhysical =
      existing.type === "PHYSICAL" || existing.type === "BOTH"

    let participantsUpdated = 0

    if (nextLabel !== existing.label) {
      if (affectsDigital) {
        const r = await prisma.participant.updateMany({
          where: { digitalCertStatus: existing.label },
          data: { digitalCertStatus: nextLabel },
        })
        participantsUpdated += r.count
      }
      if (affectsPhysical) {
        const r = await prisma.participant.updateMany({
          where: { physicalCertStatus: existing.label },
          data: { physicalCertStatus: nextLabel },
        })
        participantsUpdated += r.count
      }
    }

    await prisma.certificateStatusOption.update({
      where: { id },
      data: {
        label: nextLabel,
        isCompleted: nextCompleted,
      },
    })

    const participantWhere =
      affectsDigital && affectsPhysical
        ? {
            OR: [
              { digitalCertStatus: nextLabel },
              { physicalCertStatus: nextLabel },
            ],
          }
        : affectsDigital
          ? { digitalCertStatus: nextLabel }
          : { physicalCertStatus: nextLabel }

    const affected = await prisma.participant.findMany({
      where: participantWhere,
      select: {
        id: true,
        traineeId: true,
        idNumber: true,
        fullName: true,
        phone: true,
        email: true,
        digitalCertStatus: true,
        physicalCertStatus: true,
      },
    })

    if (affected.length) {
      if (affectsDigital) {
        await syncTraineeFlagsForParticipants(affected, {
          digitalCertStatus: nextLabel,
          digitalIsCompleted: nextCompleted,
        })
      }
      if (affectsPhysical) {
        await syncTraineeFlagsForParticipants(affected, {
          physicalCertStatus: nextLabel,
          physicalIsCompleted: nextCompleted,
        })
      }
      if (!participantsUpdated) participantsUpdated = affected.length
    }

    revalidatePath("/certificates")
    revalidatePath("/clients")
    return {
      ok: true,
      data: {
        id,
        label: nextLabel,
        isCompleted: nextCompleted,
        participantsUpdated,
      },
    }
  } catch (err) {
    console.error("[updateCertificateStatusOptionAction]", err)
    return { ok: false, error: "שגיאה בעדכון הסטטוס" }
  }
}

/**
 * מאחד מחזורים עם אותו שם — שומר את המחזור עם הכי הרבה משתתפים (שוויון: הישן ביותר).
 */
async function mergeDuplicateCertificateBatches(): Promise<number> {
  const batches = await prisma.certificateBatch.findMany({
    include: { _count: { select: { participants: true } } },
    orderBy: { createdAt: "asc" },
  })

  const groups = new Map<string, typeof batches>()
  for (const batch of batches) {
    const key = normalizeBatchName(batch.name)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(batch)
    groups.set(key, list)
  }

  let merged = 0
  for (const group of groups.values()) {
    if (group.length <= 1) continue

    group.sort(
      (a, b) =>
        b._count.participants - a._count.participants ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    const keeper = group[0]!
    for (const dupe of group.slice(1)) {
      await prisma.participant.updateMany({
        where: { certificateBatchId: dupe.id },
        data: { certificateBatchId: keeper.id },
      })
      await prisma.certificateBatch.delete({ where: { id: dupe.id } })
      merged++
    }
  }

  if (merged > 0) {
    revalidatePath("/certificates")
  }
  return merged
}

export async function mergeDuplicateCertificateBatchesAction(): Promise<
  ActionResult<{ merged: number }>
> {
  try {
    const merged = await mergeDuplicateCertificateBatches()
    return { ok: true, data: { merged } }
  } catch (err) {
    console.error("[mergeDuplicateCertificateBatchesAction]", err)
    return { ok: false, error: "שגיאה באיחוד מחזורים כפולים" }
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
    await mergeDuplicateCertificateBatches()

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
            courseCategory: true,
            courseCategoryOther: true,
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
        category: resolveHubCategoryLabel({
          isExternal: p.isExternal,
          participantCategory: p.courseCategory,
          leadCategory: p.lead?.courseCategory,
          leadCategoryOther: p.lead?.courseCategoryOther,
        }),
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

    return { ok: true, data: sortCertificatesHubRows(out) }
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
    const registry = await loadCertificateStatusRegistry()

    const digitalResolved =
      data.digitalCertStatus !== undefined
        ? resolveCertificateStatusLabel(data.digitalCertStatus, registry)
        : null
    const physicalResolved =
      data.physicalCertStatus !== undefined
        ? resolveCertificateStatusLabel(data.physicalCertStatus, registry)
        : null

    if (digitalResolved && !digitalResolved.known) {
      return {
        ok: false,
        error: `סטטוס דיגיטלי לא מוכר: «${digitalResolved.label}» — יש ליצור אותו קודם`,
      }
    }
    if (physicalResolved && !physicalResolved.known) {
      return {
        ok: false,
        error: `סטטוס פיזי לא מוכר: «${physicalResolved.label}» — יש ליצור אותו קודם`,
      }
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

    const result = await prisma.participant.updateMany({
      where: { id: { in: allIds } },
      data,
    })

    const needDigitalFlag = digitalResolved !== null
    const needPhysicalFlag = physicalResolved !== null

    if (needDigitalFlag || needPhysicalFlag) {
      for (const p of participants) {
        const traineePatch: {
          certificateEmailSent?: boolean
          certificateCardPrinted?: boolean
        } = {}
        if (needDigitalFlag) {
          traineePatch.certificateEmailSent = digitalResolved!.isCompleted
        }
        if (needPhysicalFlag) {
          traineePatch.certificateCardPrinted = physicalResolved!.isCompleted
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
              certificateEmailSent: digitalResolved?.isCompleted ?? false,
              certificateCardPrinted: physicalResolved?.isCompleted ?? false,
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
    await mergeDuplicateCertificateBatches()

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
      const name = normalizeBatchName(input.newBatchName)
      if (!name) return { ok: false, error: "יש להזין שם מחזור" }

      const existingByName = await prisma.certificateBatch.findFirst({
        where: { name },
        orderBy: { createdAt: "asc" },
      })

      if (existingByName) {
        batchId = existingByName.id
        batchName = existingByName.name
      } else {
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
