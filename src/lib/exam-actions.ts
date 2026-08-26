"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  EXAM_TARGET_QUESTION_COUNT,
  draftAnswerCount,
  fisherYatesShuffle,
  parseIdListJson,
  parseOptionsJson,
  scaleQuestionPoints,
  scoreExamAnswers,
  type ExamAnswers,
  type ExamQuestionDto,
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
  questions: ExamQuestionDto[]
  assignedQuestionIds: string[]
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

function toDto(row: {
  id: string
  question: string
  options: unknown
  correctAnswer: string
  points: number
  isActive?: boolean
  orderIndex?: number
}): ExamQuestionDto {
  return {
    id: row.id,
    question: row.question,
    options: parseOptionsJson(row.options),
    correctAnswer: row.correctAnswer,
    points: row.points,
    isActive: row.isActive,
    orderIndex: row.orderIndex,
  }
}

async function ensureSeedQuestions() {
  const count = await prisma.examQuestion.count()
  if (count > 0) return
  const { EXAM_QUESTIONS } = await import("@/lib/exam-questions")
  await prisma.examQuestion.createMany({
    data: EXAM_QUESTIONS.map((q, i) => ({
      question: q.question,
      options: q.options as unknown as Prisma.InputJsonValue,
      correctAnswer: q.correctAnswer,
      points: q.points,
      isActive: true,
      orderIndex: i + 1,
    })),
  })
}

async function loadQuestionsByIds(ids: string[]): Promise<ExamQuestionDto[]> {
  if (!ids.length) return []
  const rows = await prisma.examQuestion.findMany({
    where: { id: { in: ids } },
  })
  const byId = new Map(rows.map((r) => [r.id, toDto(r)]))
  // שמירה על סדר הנעילה המקורי
  return ids.map((id) => byId.get(id)).filter(Boolean) as ExamQuestionDto[]
}

async function pickAndLockQuestions(): Promise<{
  ids: string[]
  questions: ExamQuestionDto[]
}> {
  await ensureSeedQuestions()
  const active = await prisma.examQuestion.findMany({
    where: { isActive: true },
    orderBy: { orderIndex: "asc" },
  })
  if (!active.length) {
    throw new Error("אין שאלות פעילות במאגר המבחן")
  }

  const shuffled = fisherYatesShuffle(active)
  const picked =
    shuffled.length >= EXAM_TARGET_QUESTION_COUNT
      ? shuffled.slice(0, EXAM_TARGET_QUESTION_COUNT)
      : shuffled

  let questions = picked.map(toDto)
  questions = scaleQuestionPoints(questions)
  const ids = questions.map((q) => q.id)
  return { ids, questions }
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

  try {
    await ensureSeedQuestions()
  } catch {
    /* ignore */
  }

  let trainee = await prisma.trainee.findUnique({ where: { idNumber } })
  const participant = await prisma.participant.findFirst({
    where: { idNumber },
    orderBy: { createdAt: "desc" },
  })

  let answers = asAnswers(
    trainee?.examDraftAnswers ?? participant?.examDraftAnswers,
  )
  const examScore = trainee?.examScore ?? participant?.examScore ?? undefined
  const examPassed = Boolean(
    trainee?.examPassed ?? participant?.examPassed ?? false,
  )
  const examCompletedAt =
    trainee?.examCompletedAt ?? participant?.examCompletedAt ?? undefined

  let assignedIds = parseIdListJson(
    trainee?.assignedQuestionIds ?? participant?.assignedQuestionIds,
  )

  let questions: ExamQuestionDto[] = []

  if (assignedIds.length > 0) {
    questions = await loadQuestionsByIds(assignedIds)
    // אם שאלות נמחקו — משלימים מסט פעיל רק אם אין בכלל
    if (questions.length === 0) {
      assignedIds = []
    } else {
      questions = scaleQuestionPoints(questions)
    }
  }

  if (assignedIds.length === 0) {
    try {
      const picked = await pickAndLockQuestions()
      assignedIds = picked.ids
      questions = picked.questions
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "לא ניתן לטעון שאלות מבחן",
      }
    }

    answers = {}
    const idsJson = assignedIds as unknown as Prisma.InputJsonValue
    // נעילה ראשונה — מאפסים טיוטות ישנות שלא תואמות למזהי השאלות החדשים
    if (!trainee) {
      trainee = await prisma.trainee.create({
        data: {
          fullName,
          idNumber,
          assignedQuestionIds: idsJson,
          examDraftAnswers: {},
        },
      })
    } else {
      await prisma.trainee.update({
        where: { id: trainee.id },
        data: {
          fullName: fullName || trainee.fullName,
          assignedQuestionIds: idsJson,
          examDraftAnswers: {},
        },
      })
    }
    await prisma.participant.updateMany({
      where: { idNumber },
      data: {
        assignedQuestionIds: idsJson,
        examDraftAnswers: {},
      },
    })
  } else if (trainee && fullName && trainee.fullName !== fullName) {
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
      questions,
      assignedQuestionIds: assignedIds,
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

  const answersJson = asAnswers(input.answers) as Prisma.InputJsonValue

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
    unansweredIds: string[]
  }>
> {
  const idNumber = normalizeParticipantIdNumber(input.idNumber)
  const fullName = input.fullName.trim() || "ללא שם"
  if (!idNumber) return { ok: false, error: "חסר מספר תעודת זהות" }

  const trainee = await prisma.trainee.findUnique({ where: { idNumber } })
  const participant = await prisma.participant.findFirst({
    where: { idNumber },
    orderBy: { createdAt: "desc" },
  })

  const assignedIds = parseIdListJson(
    trainee?.assignedQuestionIds ?? participant?.assignedQuestionIds,
  )
  if (!assignedIds.length) {
    return { ok: false, error: "לא נמצא סט שאלות נעול למבחן — התחילו מחדש" }
  }

  let questions = await loadQuestionsByIds(assignedIds)
  if (!questions.length) {
    return { ok: false, error: "השאלות שננעלו למבחן אינן זמינות יותר" }
  }
  questions = scaleQuestionPoints(questions)

  const answers = asAnswers(input.answers)
  const result = scoreExamAnswers(questions, answers)
  if (result.unansweredIds.length > 0) {
    return {
      ok: false,
      error: `יש לענות על כל השאלות לפני ההגשה (חסרות ${result.unansweredIds.length})`,
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
    assignedQuestionIds: assignedIds as unknown as Prisma.InputJsonValue,
  }

  if (!trainee) {
    await prisma.trainee.create({
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
