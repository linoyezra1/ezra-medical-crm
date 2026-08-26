"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  EXAM_QUESTIONS,
  parseOptionsJson,
  type ExamQuestionDto,
} from "@/lib/exam-questions"
import type { Prisma } from "@/generated/prisma/client"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

export type AdminExamQuestion = ExamQuestionDto & {
  createdAt: string
  updatedAt: string
}

function toDto(row: {
  id: string
  question: string
  options: unknown
  correctAnswer: string
  points: number
  isActive: boolean
  orderIndex: number
  createdAt: Date
  updatedAt: Date
}): AdminExamQuestion {
  return {
    id: row.id,
    question: row.question,
    options: parseOptionsJson(row.options),
    correctAnswer: row.correctAnswer,
    points: row.points,
    isActive: row.isActive,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function validateQuestionInput(data: {
  question: string
  options: string[]
  correctAnswer: string
}): string | null {
  const question = data.question.trim()
  if (!question) return "יש להזין טקסט שאלה"
  const options = data.options.map((o) => o.trim()).filter(Boolean)
  if (options.length !== 4) return "יש להזין בדיוק 4 אופציות"
  if (!data.correctAnswer.trim()) return "יש לבחור תשובה נכונה"
  if (!options.includes(data.correctAnswer.trim())) {
    return "התשובה הנכונה חייבת להיות אחת מארבע האופציות"
  }
  return null
}

/** ממלא את מאגר השאלות מה-seed אם ריק */
export async function ensureExamQuestionsSeeded(): Promise<
  ActionResult<{ count: number; seeded: boolean }>
> {
  const count = await prisma.examQuestion.count()
  if (count > 0) return { ok: true, data: { count, seeded: false } }

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
  const next = await prisma.examQuestion.count()
  revalidatePath("/exam-questions")
  return { ok: true, data: { count: next, seeded: true } }
}

/** רשימה מלאה לניהול (כולל מושבתות) + חיפוש */
export async function listAllExamQuestionsForAdmin(input?: {
  q?: string
}): Promise<ActionResult<{ questions: AdminExamQuestion[] }>> {
  await ensureExamQuestionsSeeded()
  const term = input?.q?.trim()
  const rows = await prisma.examQuestion.findMany({
    where: term
      ? {
          OR: [
            { question: { contains: term, mode: "insensitive" } },
            { correctAnswer: { contains: term, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  })
  return { ok: true, data: { questions: rows.map(toDto) } }
}

export async function createExamQuestion(input: {
  question: string
  options: string[]
  correctAnswer: string
  isActive?: boolean
  points?: number
}): Promise<ActionResult<{ id: string }>> {
  const err = validateQuestionInput(input)
  if (err) return { ok: false, error: err }

  const options = input.options.map((o) => o.trim())
  const maxOrder = await prisma.examQuestion.aggregate({
    _max: { orderIndex: true },
  })
  const created = await prisma.examQuestion.create({
    data: {
      question: input.question.trim(),
      options: options as unknown as Prisma.InputJsonValue,
      correctAnswer: input.correctAnswer.trim(),
      points: input.points ?? 4,
      isActive: input.isActive !== false,
      orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
    },
  })
  revalidatePath("/exam-questions")
  return { ok: true, data: { id: created.id } }
}

export async function updateExamQuestion(
  id: string,
  input: {
    question: string
    options: string[]
    correctAnswer: string
    isActive?: boolean
    points?: number
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.examQuestion.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: "השאלה לא נמצאה" }

  const err = validateQuestionInput(input)
  if (err) return { ok: false, error: err }

  const options = input.options.map((o) => o.trim())
  await prisma.examQuestion.update({
    where: { id },
    data: {
      question: input.question.trim(),
      options: options as unknown as Prisma.InputJsonValue,
      correctAnswer: input.correctAnswer.trim(),
      points: input.points ?? existing.points,
      isActive: input.isActive ?? existing.isActive,
    },
  })
  revalidatePath("/exam-questions")
  return { ok: true, data: { id } }
}

export async function setExamQuestionActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.examQuestion.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: "השאלה לא נמצאה" }
  await prisma.examQuestion.update({
    where: { id },
    data: { isActive },
  })
  revalidatePath("/exam-questions")
  return { ok: true, data: { id } }
}

export async function deleteExamQuestion(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.examQuestion.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: "השאלה לא נמצאה" }
  await prisma.examQuestion.delete({ where: { id } })
  revalidatePath("/exam-questions")
  return { ok: true, data: { id } }
}
