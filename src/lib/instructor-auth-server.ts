import { cookies } from "next/headers"
import { prisma } from "@/lib/db"

import { instructorLoginUrl as buildLoginUrl } from "@/lib/instructor-portal-urls"

export const INSTRUCTOR_SESSION_COOKIE = "instructor-token"

export type AuthenticatedInstructor = {
  id: string
  name: string
  fee: number
  phone: string | null
  username: string
  salesCommissionPercentage: number
  role: string
  allowedEquipmentIds: string[]
}

export async function getInstructorSessionId(): Promise<string | null> {
  try {
    const store = await cookies()
    return store.get(INSTRUCTOR_SESSION_COOKIE)?.value || null
  } catch {
    return null
  }
}

export async function setInstructorSession(instructorId: string): Promise<void> {
  const store = await cookies()
  store.set(INSTRUCTOR_SESSION_COOKIE, instructorId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearInstructorSession(): Promise<void> {
  const store = await cookies()
  store.delete(INSTRUCTOR_SESSION_COOKIE)
}

export async function getAuthenticatedInstructor(): Promise<AuthenticatedInstructor | null> {
  const id = await getInstructorSessionId()
  if (!id) return null

  const row = await prisma.instructor.findFirst({
    where: { id, active: true },
    select: {
      id: true,
      name: true,
      fee: true,
      phone: true,
      username: true,
      salesCommissionPercentage: true,
      role: true,
      allowedEquipmentIds: true,
    },
  })

  if (!row?.username?.trim()) return null

  return {
    id: row.id,
    name: row.name,
    fee: row.fee || 0,
    phone: row.phone,
    username: row.username.trim(),
    salesCommissionPercentage: row.salesCommissionPercentage || 0,
    role: row.role || "INSTRUCTOR",
    allowedEquipmentIds: Array.isArray(row.allowedEquipmentIds)
      ? row.allowedEquipmentIds.filter(Boolean)
      : [],
  }
}

export async function requireAuthenticatedInstructor(): Promise<AuthenticatedInstructor> {
  const instructor = await getAuthenticatedInstructor()
  if (!instructor) {
    throw new Error("UNAUTHORIZED_INSTRUCTOR")
  }
  return instructor
}

export function instructorLoginUrl(origin?: string): string {
  return buildLoginUrl(origin)
}
