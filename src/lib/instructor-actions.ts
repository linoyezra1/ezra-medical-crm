"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { formatCourseTypeLabel, findCourseCatalog } from "@/lib/course-type"
import { resolveCourseMaterialOpenUrls } from "@/lib/course-materials"
import {
  clearInstructorSession,
  getAuthenticatedInstructor,
  requireAuthenticatedInstructor,
  setInstructorSession,
} from "@/lib/instructor-auth-server"
import { mapLead, mapInstructor, mapSettings } from "@/lib/mappers"
import { resolveInstructorFee } from "@/lib/training-profit"
import type { CourseCatalogItem, InstructorProfile, Lead } from "@/lib/types"
import type { TrainingSessionSlot } from "@/lib/payment"
import { addTrainingSale, type ActionResult } from "@/lib/actions"
import { cleanPhone } from "@/lib/helpers"

export type InstructorTrainingCard = {
  id: string
  title: string
  date?: string
  time?: string
  endTime?: string
  fee: number
  status: Lead["status"]
  addressLine: string
  isZoom: boolean
  zoomLink?: string
  wazeUrl?: string
  sessions: TrainingSessionSlot[]
  /** קישור ישיר למצגת (פתיחה בטאב חדש) */
  presentationUrl: string | null
  /** קישור ישיר לחוברת (פתיחה בטאב חדש) */
  bookletUrl: string | null
}

export type InstructorDashboardData = {
  instructor: {
    id: string
    name: string
    fee: number
    salesCommissionPercentage: number
  }
  kpis: {
    trainingFees: number
    salesCommissions: number
    totalCompensation: number
  }
  upcoming: InstructorTrainingCard[]
  completed: InstructorTrainingCard[]
  inventory: Array<{ id: string; name: string; sellingPrice: number }>
}

function wazeUrlForAddress(parts: {
  city?: string
  street?: string
  houseNumber?: string
}): string | undefined {
  const q = [parts.street, parts.houseNumber, parts.city]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" ")
  if (!q) return undefined
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`
}

function toTrainingCard(
  lead: Lead,
  instructors: Array<{ id: string; name: string; fee: number; active: boolean }>,
  courses: CourseCatalogItem[],
): InstructorTrainingCard {
  const session = lead.sessions?.[0]
  const isZoom = Boolean(session?.isZoom || lead.sessions?.every((s) => s.isZoom))
  const zoomLink = lead.sessions?.find((s) => s.zoomLink?.trim())?.zoomLink?.trim()
  const city = session?.city || lead.address?.city
  const street = session?.street || lead.address?.street
  const houseNumber = session?.houseNumber || lead.address?.houseNumber
  const addressLine = isZoom
    ? "זום"
    : [street, houseNumber, city].filter(Boolean).join(" ") || "—"

  const catalog = findCourseCatalog(lead.courseType, courses)
  const materials = resolveCourseMaterialOpenUrls({
    courseType: lead.courseType,
    presentationUrl: catalog?.presentationUrl,
    bookletUrl: catalog?.bookletUrl,
    // יחסי לאותו דומיין — אותם קבצי public כמו בפעולות המהירות
    baseUrl: "",
  })

  return {
    id: lead.id,
    title: formatCourseTypeLabel(lead.courseType, {
      other: lead.courseTypeOther,
    }),
    date: lead.date,
    time: lead.time,
    endTime: lead.endTime,
    fee: resolveInstructorFee(lead, instructors),
    status: lead.status,
    addressLine,
    isZoom,
    zoomLink,
    wazeUrl: isZoom ? undefined : wazeUrlForAddress({ city, street, houseNumber }),
    sessions: lead.sessions || [],
    presentationUrl: materials.presentationUrl,
    bookletUrl: materials.bookletUrl,
  }
}

export async function instructorLogin(
  username: string,
  password: string,
): Promise<ActionResult<{ name: string }>> {
  const u = username.trim()
  const p = password
  if (!u || !p) {
    return { ok: false, error: "יש להזין שם משתמש וסיסמה" }
  }

  try {
    const instructor = await prisma.instructor.findFirst({
      where: { username: u, active: true },
    })
    if (!instructor?.password || instructor.password !== p) {
      return { ok: false, error: "שם משתמש או סיסמה שגויים" }
    }
    await setInstructorSession(instructor.id)
    return { ok: true, data: { name: instructor.name } }
  } catch (err) {
    console.error("[instructorLogin]", err)
    return { ok: false, error: "שגיאה בהתחברות" }
  }
}

export async function instructorLogout(): Promise<void> {
  await clearInstructorSession()
  revalidatePath("/instructor")
}

export async function fetchInstructorDashboard(): Promise<
  ActionResult<InstructorDashboardData>
> {
  try {
    const auth = await requireAuthenticatedInstructor()

    const [leadsDb, inventoryDb, commissionAgg, courseAssets, settingsRow] =
      await Promise.all([
      prisma.lead.findMany({
        where: {
          instructorId: auth.id,
          courseStatus: { notIn: ["lost", "new"] },
        },
        include: {
          participants: true,
          trainingSessions: { orderBy: { sortOrder: "asc" } },
          expenses: true,
          trainingSales: {
            include: {
              inventoryItem: true,
              participant: { select: { id: true, fullName: true } },
              reportedByInstructor: { select: { id: true, name: true } },
            },
          },
          instructorRef: true,
          activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
        },
        orderBy: { scheduledStart: "asc" },
      }),
      prisma.inventoryItem.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, sellingPrice: true },
      }),
      prisma.trainingSale.aggregate({
        where: { reportedByInstructorId: auth.id },
        _sum: { instructorCommissionAmount: true },
      }),
      prisma.courseAsset.findMany(),
      prisma.settings.findFirst(),
    ])

    const instructors = [
      {
        id: auth.id,
        name: auth.name,
        fee: auth.fee,
        active: true,
      },
    ]
    const leads = leadsDb.map((l) => mapLead(l))
    const courses = mapSettings(settingsRow, courseAssets).courses

    const allowedIds = new Set(auth.allowedEquipmentIds)
    const allowedInventory = inventoryDb.filter((i) => allowedIds.has(i.id))

    const feeStatuses = new Set<Lead["status"]>([
      "closed",
      "pending_certificates",
      "completed",
    ])
    const trainingFees = leads
      .filter((l) => feeStatuses.has(l.status))
      .reduce((s, l) => s + resolveInstructorFee(l, instructors), 0)

    const salesCommissions = commissionAgg._sum.instructorCommissionAmount || 0

    const upcoming = leads
      .filter((l) => l.status === "closed")
      .map((l) => toTrainingCard(l, instructors, courses))

    const completed = leads
      .filter((l) =>
        ["pending_certificates", "completed"].includes(l.status),
      )
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map((l) => toTrainingCard(l, instructors, courses))

    return {
      ok: true,
      data: {
        instructor: {
          id: auth.id,
          name: auth.name,
          fee: auth.fee,
          salesCommissionPercentage: auth.salesCommissionPercentage,
        },
        kpis: {
          trainingFees,
          salesCommissions,
          totalCompensation: trainingFees + salesCommissions,
        },
        upcoming,
        completed,
        inventory: allowedInventory.map((i) => ({
          id: i.id,
          name: i.name?.trim() || "פריט",
          sellingPrice: Number(i.sellingPrice) || 0,
        })),
      },
    }
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_INSTRUCTOR") {
      return { ok: false, error: "נדרשת התחברות" }
    }
    console.error("[fetchInstructorDashboard]", err)
    return { ok: false, error: "לא ניתן לטעון את האזור האישי" }
  }
}

export async function reportInstructorTrainingSale(input: {
  leadId: string
  inventoryItemId: string
  quantity: number
  unitSellingPrice: number
}): Promise<ActionResult<{ commission: number; saleId: string }>> {
  try {
    const auth = await requireAuthenticatedInstructor()
    const lead = await prisma.lead.findFirst({
      where: { id: input.leadId, instructorId: auth.id },
      select: { id: true },
    })
    if (!lead) {
      return { ok: false, error: "אין הרשאה לדווח מכירה להדרכה זו" }
    }

    if (!auth.allowedEquipmentIds.includes(input.inventoryItemId)) {
      return { ok: false, error: "פריט זה אינו מורשה למכירה עבורך" }
    }

    const qty = Math.max(1, Math.floor(Number(input.quantity) || 0))
    const unitSell = Number(input.unitSellingPrice)
    if (!qty || !Number.isFinite(unitSell) || unitSell < 0) {
      return { ok: false, error: "יש להזין סכום וכמות תקינים" }
    }

    const totalSale = unitSell * qty
    const commissionPct = Math.max(0, auth.salesCommissionPercentage || 0)
    const commission = Math.round((totalSale * commissionPct) / 100)

    const res = await addTrainingSale(
      input.leadId,
      input.inventoryItemId,
      qty,
      unitSell,
      {
        paymentMethod: "cash",
        unpaid: false,
        reportedByInstructorId: auth.id,
        instructorCommissionAmount: commission,
        isInstructorReported: true,
      },
    )

    if (!res.ok) return res

    revalidatePath("/instructor/dashboard")
    revalidatePath(`/leads/${input.leadId}`)
    return {
      ok: true,
      data: { commission, saleId: res.data.id },
    }
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_INSTRUCTOR") {
      return { ok: false, error: "נדרשת התחברות" }
    }
    console.error("[reportInstructorTrainingSale]", err)
    return { ok: false, error: "לא ניתן לדווח את המכירה" }
  }
}

export type InstructorAdminRow = {
  id: string
  name: string
  fee: number
  phone?: string
  username?: string
  password?: string
  salesCommissionPercentage: number
  active: boolean
  allowedEquipmentIds: string[]
}

export type InventoryCatalogItem = {
  id: string
  name: string
  sellingPrice: number
}

export async function fetchInventoryCatalogForInstructors(): Promise<
  ActionResult<InventoryCatalogItem[]>
> {
  try {
    const rows = await prisma.inventoryItem.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, sellingPrice: true },
    })
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name?.trim() || "פריט",
        sellingPrice: Number(r.sellingPrice) || 0,
      })),
    }
  } catch (err) {
    console.error("[fetchInventoryCatalogForInstructors]", err)
    return { ok: false, error: "לא ניתן לטעון מלאי" }
  }
}

export async function fetchInstructorsAdmin(): Promise<
  ActionResult<InstructorAdminRow[]>
> {
  try {
    const rows = await prisma.instructor.findMany({
      orderBy: { name: "asc" },
    })
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        fee: r.fee || 0,
        phone: r.phone?.trim() || undefined,
        username: r.username?.trim() || undefined,
        password: r.password || undefined,
        salesCommissionPercentage: r.salesCommissionPercentage || 0,
        active: r.active,
        allowedEquipmentIds: Array.isArray(r.allowedEquipmentIds)
          ? r.allowedEquipmentIds.filter(Boolean)
          : [],
      })),
    }
  } catch (err) {
    console.error("[fetchInstructorsAdmin]", err)
    return { ok: false, error: "לא ניתן לטעון מדריכים" }
  }
}

export async function upsertInstructorAdmin(input: {
  id?: string
  name: string
  fee: number
  phone?: string
  username: string
  password: string
  salesCommissionPercentage: number
  active?: boolean
  allowedEquipmentIds?: string[]
}): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim()
  const username = input.username.trim()
  const password = input.password
  if (!name) return { ok: false, error: "שם מדריך חובה" }
  if (!username) return { ok: false, error: "שם משתמש חובה" }
  if (!password) return { ok: false, error: "סיסמה חובה" }

  const allowedEquipmentIds = Array.from(
    new Set(
      (input.allowedEquipmentIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  )

  try {
    const data = {
      name,
      fee: Math.max(0, Number(input.fee) || 0),
      phone: input.phone?.trim() || null,
      username,
      password,
      salesCommissionPercentage: Math.max(
        0,
        Math.min(100, Number(input.salesCommissionPercentage) || 0),
      ),
      active: input.active !== false,
      role: "INSTRUCTOR",
      allowedEquipmentIds,
    }

    if (input.id) {
      const updated = await prisma.instructor.update({
        where: { id: input.id },
        data,
      })
      revalidatePath("/instructors")
      revalidatePath("/instructor/dashboard")
      revalidatePath("/")
      return { ok: true, data: { id: updated.id } }
    }

    const created = await prisma.instructor.create({ data })
    revalidatePath("/instructors")
    revalidatePath("/instructor/dashboard")
    revalidatePath("/")
    return { ok: true, data: { id: created.id } }
  } catch (err) {
    console.error("[upsertInstructorAdmin]", err)
    return { ok: false, error: "לא ניתן לשמור את המדריך (ייתכן שם משתמש כפול)" }
  }
}

export async function getInstructorSessionName(): Promise<string | null> {
  const auth = await getAuthenticatedInstructor()
  return auth?.name ?? null
}

/** הוספה מהירה של מדריך משיבוץ ליד/הדרכה */
export async function quickAddInstructor(input: {
  name: string
  phone: string
  salesCommissionPercentage?: number
  fee?: number
}): Promise<ActionResult<InstructorProfile>> {
  const name = input.name.trim()
  const phoneRaw = input.phone.trim()
  const loginId = cleanPhone(phoneRaw)

  if (!name) return { ok: false, error: "שם מלא חובה" }
  if (!loginId || loginId.length < 9) {
    return { ok: false, error: "יש להזין מספר טלפון תקין" }
  }

  try {
    const byUsername = await prisma.instructor.findUnique({
      where: { username: loginId },
    })
    if (byUsername) {
      return { ok: false, error: "מספר טלפון זה כבר רשום כשם משתמש למדריך אחר" }
    }

    const byName = await prisma.instructor.findUnique({ where: { name } })
    if (byName) {
      return { ok: false, error: "מדריך בשם זה כבר קיים במערכת" }
    }

    const created = await prisma.instructor.create({
      data: {
        name,
        phone: phoneRaw,
        username: loginId,
        password: loginId,
        fee: Math.max(0, Number(input.fee) || 0),
        salesCommissionPercentage: Math.max(
          0,
          Math.min(100, Number(input.salesCommissionPercentage) || 0),
        ),
        active: true,
        role: "INSTRUCTOR",
      },
    })

    revalidatePath("/")
    revalidatePath("/instructors")
    revalidatePath("/leads")

    return { ok: true, data: mapInstructor(created) }
  } catch (err) {
    console.error("[quickAddInstructor]", err)
    return { ok: false, error: "לא ניתן ליצור מדריך חדש" }
  }
}
