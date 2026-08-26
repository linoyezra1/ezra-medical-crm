"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  draftAnswerCount,
  scoreExamAnswers,
  type ExamAnswers,
} from "@/lib/exam-questions"
import { normalizeParticipantIdNumber } from "@/lib/participant-identity"
import type { Prisma } from "@/generated/prisma/client"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

export type ExamSessionState = {
  idNumber: string
  fullName: string
  traineeId?: string
  participantId?: string
  examScore?: number
  examPassed?: boolean
  examCompletedAt?: string
  answers: ExamAnswers
  hasDraft: boolean
  alreadyCompleted: boolean
}

function asAnswers(raw: unknown): ExamAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: ExamAnswers = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v
  }
  return out
}

export async function lookupExamSession(input: {
  idNumber: string
  fullName: string
}): Promise<ActionResult<ExamSessionState>> {
  const idNumber = normalizeParticipantIdNumber(input.idNumber)
  const fullName = input.fullName.trim()
  if (!idNumber || idNumber.length < 5) {
    return { ok: false, error: "יש להזין מספר תעודת זהות תקין" }
  }
  if (!fullName) {
    return { ok: false, error: "יש להזין שם מלא" }
  }

  const trainee = await prisma.trainee.findUnique({ where: { idNumber } })
  const participant = await prisma.participant.findFirst({
    where: { idNumber },
    orderBy: { createdAt: "desc" },
  })

  const source = trainee || participant
  const answers = asAnswers(
    trainee?.examDraftAnswers ?? participant?.examDraftAnswers,
  )
  const examScore = trainee?.examScore ?? participant?.examScore ?? undefined
  const examPassed = Boolean(
    trainee?.examPassed ?? participant?.examPassed ?? false,
  )
  const examCompletedAt =
    trainee?.examCompletedAt ?? participant?.examCompletedAt ?? undefined

  // עדכון שם אם חסר במודרך
  if (trainee && fullName && trainee.fullName !== fullName) {
    await prisma.trainee.update({
      where: { id: trainee.id },
      data: { fullName },
    })
  }

  return {
    ok: true,
    data: {
      idNumber,
      fullName: trainee?.fullName || participant?.fullName || fullName,
      traineeId: trainee?.id,
      participantId: participant?.id,
      examScore: examScore ?? undefined,
      examPassed,
      examCompletedAt: examCompletedAt?.toISOString(),
      answers,
      hasDraft: draftAnswerCount(answers) > 0 && !examCompletedAt,
      alreadyCompleted: Boolean(examCompletedAt && examScore != null),
    },
  }
}

export async function saveExamDraft(input: {
  idNumber: string
  fullName: string
  answers: ExamAnswers
}): Promise<ActionResult<{ saved: true }>> {
  const idNumber = normalizeParticipantIdNumber(input.idNumber)
  const fullName = input.fullName.trim() || "ללא שם"
  if (!idNumber) return { ok: false, error: "חסר מספר תעודת זהות" }

  const answers = asAnswers(input.answers)

  const answersJson = answers as Prisma.InputJsonValue

  let trainee = await prisma.trainee.findUnique({ where: { idNumber } })
  if (!trainee) {
    trainee = await prisma.trainee.create({
      data: {
        fullName,
        idNumber,
        examDraftAnswers: answersJson,
      },
    })
  } else {
    await prisma.trainee.update({
      where: { id: trainee.id },
      data: {
        fullName: fullName || trainee.fullName,
        examDraftAnswers: answersJson,
      },
    })
  }

  await prisma.participant.updateMany({
    where: { idNumber },
    data: { examDraftAnswers: answersJson },
  })

  return { ok: true, data: { saved: true } }
}

export async function submitExam(input: {
  idNumber: string
  fullName: string
  answers: ExamAnswers
}): Promise<
  ActionResult<{
    score: number
    passed: boolean
    unansweredIds: number[]
  }>
> {
  const idNumber = normalizeParticipantIdNumber(input.idNumber)
  const fullName = input.fullName.trim() || "ללא שם"
  if (!idNumber) return { ok: false, error: "חסר מספר תעודת זהות" }

  const answers = asAnswers(input.answers)
  const result = scoreExamAnswers(answers)
  if (result.unansweredIds.length > 0) {
    return {
      ok: false,
      error: `יש לענות על כל השאלות לפני ההגשה (חסרות: ${result.unansweredIds.join(", ")})`,
      code: "unanswered",
    }
  }

  const completedAt = new Date()
  const answersJson = answers as Prisma.InputJsonValue
  const examData = {
    examScore: result.score,
    examPassed: result.passed,
    examCompletedAt: completedAt,
    examDraftAnswers: answersJson,
  }

  let trainee = await prisma.trainee.findUnique({ where: { idNumber } })
  if (!trainee) {
    trainee = await prisma.trainee.create({
      data: {
        fullName,
        idNumber,
        ...examData,
      },
    })
  } else {
    await prisma.trainee.update({
      where: { id: trainee.id },
      data: {
        fullName: fullName || trainee.fullName,
        ...examData,
      },
    })
  }

  await prisma.participant.updateMany({
    where: { idNumber },
    data: examData,
  })

  revalidatePath("/clients")
  revalidatePath("/leads")
  revalidatePath("/trainings")

  return { ok: true, data: result }
}
