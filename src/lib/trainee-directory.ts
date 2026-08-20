import { randomUUID } from "crypto"
import { prisma } from "@/lib/db"
import {
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity"

export type ParticipantContactInput = {
  id: string
  fullName: string
  idNumber: string
  email?: string | null
  phone?: string | null
  traineeId?: string | null
}

/**
 * Upsert מודרך גלובלי לפי ת״ז (או טלפון כשאין ת״ז).
 * מעדכן תמיד שם / מייל / טלפון כשקיימים ערכים.
 */
export async function upsertTraineeFromParticipant(data: {
  fullName: string
  idNumber: string
  email?: string | null
  phone?: string | null
}) {
  const fullName = data.fullName.trim() || "ללא שם"
  let idNumber = normalizeParticipantIdNumber(data.idNumber)
  const phone = data.phone?.trim() || null
  const email = data.email?.trim() || null

  if (!idNumber && phone) {
    const byPhone = await prisma.trainee.findFirst({
      where: { phone },
      orderBy: { updatedAt: "desc" },
    })
    if (byPhone) {
      return prisma.trainee.update({
        where: { id: byPhone.id },
        data: {
          fullName,
          email: email ?? undefined,
          phone,
        },
      })
    }
  }

  if (!idNumber) {
    idNumber = `temp-${randomUUID()}`
  }

  return prisma.trainee.upsert({
    where: { idNumber },
    create: {
      fullName,
      idNumber,
      email,
      phone,
    },
    update: {
      fullName,
      email: email ?? undefined,
      phone: phone ?? undefined,
    },
  })
}

/**
 * סנכרון פרטי קשר מ-Participant → Trainee (Single Source of Truth לפרטי זהות).
 * תמיד מעדכן את רשומת המודרך המקושרת / לפי ת״ז, ולא רק בפעם הראשונה.
 */
export async function syncParticipantContactToTrainee(
  p: ParticipantContactInput,
): Promise<string> {
  const fullName = p.fullName.trim() || "ללא שם"
  const idNumber = normalizeParticipantIdNumber(p.idNumber)
  const phone = p.phone?.trim() || null
  const email = p.email?.trim() || null

  // 1) כבר מקושר — מעדכנים את אותה רשומת Trainee
  if (p.traineeId) {
    const linked = await prisma.trainee.findUnique({
      where: { id: p.traineeId },
    })
    if (linked) {
      let nextIdNumber = linked.idNumber
      if (
        isUsableParticipantIdNumber(idNumber) &&
        idNumber !== normalizeParticipantIdNumber(linked.idNumber)
      ) {
        const clash = await prisma.trainee.findUnique({
          where: { idNumber },
        })
        if (!clash || clash.id === linked.id) {
          nextIdNumber = idNumber
        } else {
          // ת״ז תפוסה אצל מודרך אחר — מאחדים לקיים ומעבירים את הקישור
          await prisma.trainee.update({
            where: { id: clash.id },
            data: {
              fullName,
              email: email ?? undefined,
              phone: phone ?? undefined,
            },
          })
          await prisma.participant.update({
            where: { id: p.id },
            data: { traineeId: clash.id },
          })
          return clash.id
        }
      } else if (
        isUsableParticipantIdNumber(idNumber) &&
        linked.idNumber.startsWith("temp-")
      ) {
        const clash = await prisma.trainee.findUnique({
          where: { idNumber },
        })
        if (!clash) nextIdNumber = idNumber
      }

      await prisma.trainee.update({
        where: { id: linked.id },
        data: {
          fullName,
          email: email ?? undefined,
          phone: phone ?? undefined,
          ...(nextIdNumber !== linked.idNumber
            ? { idNumber: nextIdNumber }
            : {}),
        },
      })
      return linked.id
    }
  }

  // 2) אין קישור / נותק — upsert לפי ת״ז וקישור מחדש
  const trainee = await upsertTraineeFromParticipant({
    fullName,
    idNumber: idNumber || p.idNumber,
    email,
    phone,
  })

  if (p.traineeId !== trainee.id) {
    await prisma.participant.update({
      where: { id: p.id },
      data: { traineeId: trainee.id },
    })
  }

  return trainee.id
}

/** קישור ראשוני בלבד — לתאימות לאחור; מעדיפים syncParticipantContactToTrainee */
export async function linkParticipantToTrainee(
  p: ParticipantContactInput,
): Promise<string> {
  return syncParticipantContactToTrainee(p)
}
