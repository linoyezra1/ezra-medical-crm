"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  isTripEscortRole,
  parseAssignedSessionIds,
  TRIP_ESCORT_EXPENSE_TYPE,
  tripEscortRoleLabel,
  type TripEscortRole,
  type TripEscortStaffRow,
} from "@/lib/trip-escort"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function mapStaff(row: {
  id: string
  leadId: string
  fullName: string
  phone: string
  idNumber: string
  role: string
  assignedSessionIds: unknown
  payAmount: number
  notes: string | null
  expenseId: string | null
}): TripEscortStaffRow {
  return {
    id: row.id,
    leadId: row.leadId,
    fullName: row.fullName,
    phone: row.phone || "",
    idNumber: row.idNumber || "",
    role: row.role,
    assignedSessionIds: parseAssignedSessionIds(row.assignedSessionIds),
    payAmount: Number(row.payAmount) || 0,
    notes: row.notes || undefined,
    expenseId: row.expenseId || undefined,
  }
}

function expenseNotes(fullName: string, role: string): string {
  return `${fullName.trim()} · ${tripEscortRoleLabel(role)}`
}

async function syncStaffExpense(opts: {
  leadId: string
  fullName: string
  role: string
  payAmount: number
  expenseId?: string | null
}): Promise<string | null> {
  const amount = Math.max(0, Number(opts.payAmount) || 0)
  const notes = expenseNotes(opts.fullName, opts.role)
  if (opts.expenseId) {
    const existing = await prisma.expense.findUnique({
      where: { id: opts.expenseId },
    })
    if (existing && existing.leadId === opts.leadId) {
      await prisma.expense.update({
        where: { id: opts.expenseId },
        data: {
          type: TRIP_ESCORT_EXPENSE_TYPE,
          amount,
          notes,
        },
      })
      return opts.expenseId
    }
  }
  const created = await prisma.expense.create({
    data: {
      leadId: opts.leadId,
      type: TRIP_ESCORT_EXPENSE_TYPE,
      amount,
      notes,
    },
  })
  return created.id
}

export async function listTripEscortStaff(
  leadId: string,
): Promise<TripEscortStaffRow[]> {
  const rows = await prisma.tripEscortStaff.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(mapStaff)
}

export async function upsertTripEscortStaff(input: {
  id?: string
  leadId: string
  fullName: string
  phone?: string
  idNumber?: string
  role: string
  assignedSessionIds: string[]
  payAmount: number
  notes?: string
}): Promise<ActionResult<{ staff: TripEscortStaffRow }>> {
  const fullName = input.fullName.trim()
  if (!fullName) return { ok: false, error: "יש למלא שם מלא" }
  if (!isTripEscortRole(input.role)) {
    return { ok: false, error: "תפקיד לא תקין" }
  }
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } })
  if (!lead) return { ok: false, error: "ההדרכה לא נמצאה" }

  const assignedSessionIds = [
    ...new Set(
      (input.assignedSessionIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ]
  const payAmount = Math.max(0, Number(input.payAmount) || 0)
  const phone = (input.phone || "").trim()
  const idNumber = (input.idNumber || "").trim()
  const notes = (input.notes || "").trim() || null
  const role = input.role as TripEscortRole

  try {
    if (input.id) {
      const existing = await prisma.tripEscortStaff.findUnique({
        where: { id: input.id },
      })
      if (!existing || existing.leadId !== input.leadId) {
        return { ok: false, error: "המלווה לא נמצא" }
      }
      const expenseId = await syncStaffExpense({
        leadId: input.leadId,
        fullName,
        role,
        payAmount,
        expenseId: existing.expenseId,
      })
      const updated = await prisma.tripEscortStaff.update({
        where: { id: input.id },
        data: {
          fullName,
          phone,
          idNumber,
          role,
          assignedSessionIds,
          payAmount,
          notes,
          expenseId,
        },
      })
      revalidatePath(`/leads/${input.leadId}`)
      revalidatePath("/leads")
      return { ok: true, data: { staff: mapStaff(updated) } }
    }

    const expenseId = await syncStaffExpense({
      leadId: input.leadId,
      fullName,
      role,
      payAmount,
    })
    const created = await prisma.tripEscortStaff.create({
      data: {
        leadId: input.leadId,
        fullName,
        phone,
        idNumber,
        role,
        assignedSessionIds,
        payAmount,
        notes,
        expenseId,
      },
    })
    revalidatePath(`/leads/${input.leadId}`)
    revalidatePath("/leads")
    return { ok: true, data: { staff: mapStaff(created) } }
  } catch (err) {
    console.error("[upsertTripEscortStaff]", err)
    return {
      ok: false,
      error: "לא ניתן לשמור את המלווה. יש לוודא שעדכון בסיס הנתונים הושלם",
    }
  }
}

export async function deleteTripEscortStaff(
  id: string,
  leadId: string,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.tripEscortStaff.findUnique({ where: { id } })
  if (!existing || existing.leadId !== leadId) {
    return { ok: false, error: "המלווה לא נמצא" }
  }
  await prisma.tripEscortStaff.delete({ where: { id } })
  if (existing.expenseId) {
    await prisma.expense
      .delete({ where: { id: existing.expenseId } })
      .catch(() => undefined)
  }
  revalidatePath(`/leads/${leadId}`)
  revalidatePath("/leads")
  return { ok: true, data: { id } }
}
