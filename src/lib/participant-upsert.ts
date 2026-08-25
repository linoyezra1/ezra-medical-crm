import { prisma } from "@/lib/db"
import {
  findParticipantByIdNumber,
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity"
import { syncParticipantContactToTrainee } from "@/lib/trainee-directory"

export type ParticipantMergeMode = "preferIncoming" | "preferExisting"

/** שדות שניתן למזג בעדכון / יצירה לפי ת״ז */
export type ParticipantUpsertFields = {
  fullName?: string | null
  idNumber: string
  phone?: string | null
  email?: string | null
  organizerName?: string | null
  courseDate?: string | null
  satisfaction?: string | null
  feedback?: string | null
  kitInterest?: string | null
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingHouseNo?: string | null
  shippingZip?: string | null
  source?: string | null
  isExternal?: boolean
  isLead?: boolean
  courseType?: string | null
  courseCategory?: string | null
  agreedPrice?: number | null
  attended?: boolean
  traineeId?: string | null
}

export type ParticipantUpsertResult = {
  participantId: string
  updated: boolean
  created: boolean
}

function textOrEmpty(v: string | null | undefined): string {
  return (v ?? "").trim()
}

/**
 * מיזוג שדה טקסט:
 * - preferIncoming: ערך חדש אם קיים, אחרת הקיים
 * - preferExisting: הקיים אם תקין, אחרת החדש (מילוי חסרים בלבד)
 */
export function mergeTextField(
  incoming: string | null | undefined,
  existing: string | null | undefined,
  mode: ParticipantMergeMode,
): string | null {
  const a = textOrEmpty(incoming)
  const b = textOrEmpty(existing)
  if (mode === "preferIncoming") return a || b || null
  return b || a || null
}

function mergeOptionalBool(
  incoming: boolean | undefined,
  existing: boolean,
): boolean {
  return incoming !== undefined ? incoming : existing
}

type ExistingParticipant = Awaited<
  ReturnType<typeof prisma.participant.findMany>
>[number]

/** איתור משתתף בהדרכה לפי ת״ז מנורמלת (לא השוואת מחרוזת גולמית) */
export async function findParticipantOnLeadByIdNumber(
  leadId: string,
  idNumber: string | null | undefined,
): Promise<ExistingParticipant | null> {
  const id = normalizeParticipantIdNumber(idNumber)
  if (!isUsableParticipantIdNumber(id)) return null
  const rows = await prisma.participant.findMany({ where: { leadId } })
  return findParticipantByIdNumber(rows, id) ?? null
}

export function buildMergedParticipantData(
  incoming: ParticipantUpsertFields,
  existing: ExistingParticipant | null,
  mode: ParticipantMergeMode,
): Record<string, unknown> {
  const idNumber =
    normalizeParticipantIdNumber(incoming.idNumber) ||
    (existing ? normalizeParticipantIdNumber(existing.idNumber) : "") ||
    ""

  if (!existing) {
    return {
      fullName: textOrEmpty(incoming.fullName) || "ללא שם",
      idNumber,
      phone: textOrEmpty(incoming.phone) || null,
      email: textOrEmpty(incoming.email) || null,
      organizerName: textOrEmpty(incoming.organizerName) || null,
      courseDate: textOrEmpty(incoming.courseDate) || null,
      satisfaction: textOrEmpty(incoming.satisfaction) || null,
      feedback: textOrEmpty(incoming.feedback) || null,
      kitInterest: textOrEmpty(incoming.kitInterest) || null,
      shippingCity: textOrEmpty(incoming.shippingCity) || null,
      shippingStreet: textOrEmpty(incoming.shippingStreet) || null,
      shippingHouseNo: textOrEmpty(incoming.shippingHouseNo) || null,
      shippingZip: textOrEmpty(incoming.shippingZip) || null,
      source: textOrEmpty(incoming.source) || "manual",
      isExternal: Boolean(incoming.isExternal),
      isLead: Boolean(incoming.isLead),
      courseType: textOrEmpty(incoming.courseType) || null,
      courseCategory: textOrEmpty(incoming.courseCategory) || null,
      agreedPrice:
        incoming.agreedPrice != null && Number.isFinite(incoming.agreedPrice)
          ? Number(incoming.agreedPrice)
          : null,
      attended: Boolean(incoming.attended),
      ...(incoming.traineeId ? { traineeId: incoming.traineeId } : {}),
    }
  }

  const agreedIncoming =
    incoming.agreedPrice != null && Number.isFinite(incoming.agreedPrice)
      ? Number(incoming.agreedPrice)
      : null

  return {
    fullName:
      mergeTextField(incoming.fullName, existing.fullName, mode) ||
      existing.fullName,
    idNumber: idNumber || existing.idNumber,
    phone: mergeTextField(incoming.phone, existing.phone, mode),
    email: mergeTextField(incoming.email, existing.email, mode),
    organizerName: mergeTextField(
      incoming.organizerName,
      existing.organizerName,
      mode,
    ),
    courseDate: mergeTextField(incoming.courseDate, existing.courseDate, mode),
    satisfaction: mergeTextField(
      incoming.satisfaction,
      existing.satisfaction,
      mode,
    ),
    feedback: mergeTextField(incoming.feedback, existing.feedback, mode),
    kitInterest: mergeTextField(
      incoming.kitInterest,
      existing.kitInterest,
      mode,
    ),
    shippingCity: mergeTextField(
      incoming.shippingCity,
      existing.shippingCity,
      mode,
    ),
    shippingStreet: mergeTextField(
      incoming.shippingStreet,
      existing.shippingStreet,
      mode,
    ),
    shippingHouseNo: mergeTextField(
      incoming.shippingHouseNo,
      existing.shippingHouseNo,
      mode,
    ),
    shippingZip: mergeTextField(
      incoming.shippingZip,
      existing.shippingZip,
      mode,
    ),
    source: textOrEmpty(incoming.source) || existing.source || "manual",
    isExternal: mergeOptionalBool(incoming.isExternal, existing.isExternal),
    isLead: mergeOptionalBool(incoming.isLead, existing.isLead),
    courseType: mergeTextField(incoming.courseType, existing.courseType, mode),
    courseCategory: mergeTextField(
      incoming.courseCategory,
      existing.courseCategory,
      mode,
    ),
    agreedPrice:
      mode === "preferIncoming"
        ? (agreedIncoming ?? existing.agreedPrice)
        : (existing.agreedPrice ?? agreedIncoming),
    attended:
      incoming.attended !== undefined
        ? Boolean(incoming.attended)
        : existing.attended,
    ...(incoming.traineeId
      ? { traineeId: incoming.traineeId }
      : existing.traineeId
        ? { traineeId: existing.traineeId }
        : {}),
  }
}

/** רישום פעילות קצרה על עדכון אוטומטי מקישור / Wix */
export async function logParticipantAutoUpdate(
  leadId: string,
  note: string,
  performedBy = "מערכת",
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      leadId,
      performedBy,
      previousStatus: "_note",
      newStatus: note,
    },
  })
}

/**
 * Upsert משתתף בהדרכה לפי ת״ז מנורמלת.
 * לא יוצר כפילות באותה הדרכה; משייך/מעדכן מודרך גלובלי לפי ת״ז.
 */
export async function upsertParticipantOnLead(opts: {
  leadId: string
  data: ParticipantUpsertFields
  mergeMode: ParticipantMergeMode
  /** הודעת יומן פעילות — נרשמת רק בעדכון */
  activityNote?: string | null
  syncTrainee?: boolean
}): Promise<ParticipantUpsertResult> {
  const idNumber = normalizeParticipantIdNumber(opts.data.idNumber)
  const existing = isUsableParticipantIdNumber(idNumber)
    ? await findParticipantOnLeadByIdNumber(opts.leadId, idNumber)
    : null

  const merged = buildMergedParticipantData(
    { ...opts.data, idNumber: idNumber || opts.data.idNumber },
    existing,
    opts.mergeMode,
  )

  if (existing) {
    const saved = await prisma.participant.update({
      where: { id: existing.id },
      data: merged,
    })
    if (opts.syncTrainee !== false) {
      const usableId = normalizeParticipantIdNumber(saved.idNumber)
      if (
        saved.traineeId ||
        saved.attended ||
        isUsableParticipantIdNumber(usableId)
      ) {
        await syncParticipantContactToTrainee(saved)
      }
    }
    if (opts.activityNote?.trim()) {
      await logParticipantAutoUpdate(opts.leadId, opts.activityNote.trim())
    }
    return {
      participantId: saved.id,
      updated: true,
      created: false,
    }
  }

  const created = await prisma.participant.create({
    data: {
      leadId: opts.leadId,
      ...(merged as {
        fullName: string
        idNumber: string
        phone?: string | null
        email?: string | null
        organizerName?: string | null
        courseDate?: string | null
        satisfaction?: string | null
        feedback?: string | null
        kitInterest?: string | null
        shippingCity?: string | null
        shippingStreet?: string | null
        shippingHouseNo?: string | null
        shippingZip?: string | null
        source?: string
        isExternal?: boolean
        isLead?: boolean
        courseType?: string | null
        courseCategory?: string | null
        agreedPrice?: number | null
        attended?: boolean
        traineeId?: string | null
      }),
    },
  })

  if (opts.syncTrainee !== false) {
    const usableId = normalizeParticipantIdNumber(created.idNumber)
    if (
      created.traineeId ||
      created.attended ||
      isUsableParticipantIdNumber(usableId)
    ) {
      await syncParticipantContactToTrainee(created)
    } else if (isUsableParticipantIdNumber(idNumber)) {
      // קישור ראשוני למודרך גלובלי קיים עם אותה ת״ז (בלי לדרוס הדרכות אחרות)
      const trainee = await prisma.trainee.findUnique({ where: { idNumber } })
      if (trainee) {
        await syncParticipantContactToTrainee({
          ...created,
          traineeId: trainee.id,
        })
      }
    }
  }

  return {
    participantId: created.id,
    updated: false,
    created: true,
  }
}
