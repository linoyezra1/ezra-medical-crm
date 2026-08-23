"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { sanitizePhone } from "@/lib/utils"

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function sheetText(v: unknown): string {
  return String(v ?? "").trim()
}

export async function listOutreachLeadsAction(): Promise<
  ActionResult<
    {
      id: string
      name: string
      phone: string
      organization: string | null
      category: string
      createdAt: string
    }[]
  >
> {
  try {
    const rows = await prisma.outreachLead.findMany({
      orderBy: [{ createdAt: "desc" }],
    })
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        organization: r.organization,
        category: r.category,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch (err) {
    console.error("[listOutreachLeadsAction]", err)
    return { ok: false, error: "שגיאה בטעינת לידים" }
  }
}

export async function listOutreachTemplatesAction(): Promise<
  ActionResult<
    {
      id: string
      category: string
      templateText: string
      updatedAt: string
    }[]
  >
> {
  try {
    const rows = await prisma.outreachMessageTemplate.findMany({
      orderBy: [{ category: "asc" }],
    })
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        category: r.category,
        templateText: r.templateText,
        updatedAt: r.updatedAt.toISOString(),
      })),
    }
  } catch (err) {
    console.error("[listOutreachTemplatesAction]", err)
    return { ok: false, error: "שגיאה בטעינת תבניות" }
  }
}

export async function upsertOutreachTemplateAction(input: {
  id?: string
  category: string
  templateText: string
}): Promise<ActionResult<{ id: string }>> {
  const category = sheetText(input.category)
  const templateText = String(input.templateText ?? "").trim()
  if (!category) return { ok: false, error: "חסר שם קטגוריה" }
  if (!templateText) return { ok: false, error: "חסר תוכן תבנית" }

  try {
    if (input.id?.trim()) {
      const updated = await prisma.outreachMessageTemplate.update({
        where: { id: input.id.trim() },
        data: { category, templateText },
      })
      revalidatePath("/outreach-leads")
      return { ok: true, data: { id: updated.id } }
    }

    const existing = await prisma.outreachMessageTemplate.findUnique({
      where: { category },
    })
    if (existing) {
      const updated = await prisma.outreachMessageTemplate.update({
        where: { id: existing.id },
        data: { templateText },
      })
      revalidatePath("/outreach-leads")
      return { ok: true, data: { id: updated.id } }
    }

    const created = await prisma.outreachMessageTemplate.create({
      data: { category, templateText },
    })
    revalidatePath("/outreach-leads")
    return { ok: true, data: { id: created.id } }
  } catch (err) {
    console.error("[upsertOutreachTemplateAction]", err)
    return { ok: false, error: "שגיאה בשמירת התבנית (ייתכן שקטגוריה כבר קיימת)" }
  }
}

export async function deleteOutreachTemplateAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await prisma.outreachMessageTemplate.delete({ where: { id } })
    revalidatePath("/outreach-leads")
    return { ok: true, data: { id } }
  } catch (err) {
    console.error("[deleteOutreachTemplateAction]", err)
    return { ok: false, error: "שגיאה במחיקת התבנית" }
  }
}

export async function deleteOutreachLeadAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await prisma.outreachLead.delete({ where: { id } })
    revalidatePath("/outreach-leads")
    return { ok: true, data: { id } }
  } catch (err) {
    console.error("[deleteOutreachLeadAction]", err)
    return { ok: false, error: "שגיאה במחיקת הליד" }
  }
}

export async function importOutreachLeadsAction(
  rows: {
    name: string
    phone: string
    organization?: string
    category: string
  }[],
): Promise<
  ActionResult<{ imported: number; skipped: number }>
> {
  let imported = 0
  let skipped = 0

  try {
    for (const row of rows) {
      const name = sheetText(row.name)
      const phone = sanitizePhone(row.phone || "")
      const category = sheetText(row.category)
      const organization = sheetText(row.organization) || null
      if (!name || !phone || !category) {
        skipped++
        continue
      }

      const existing = await prisma.outreachLead.findFirst({
        where: { phone, category },
        select: { id: true },
      })
      if (existing) {
        await prisma.outreachLead.update({
          where: { id: existing.id },
          data: { name, organization, category },
        })
      } else {
        await prisma.outreachLead.create({
          data: { name, phone, organization, category },
        })
      }
      imported++
    }
    revalidatePath("/outreach-leads")
    return { ok: true, data: { imported, skipped } }
  } catch (err) {
    console.error("[importOutreachLeadsAction]", err)
    return { ok: false, error: "שגיאה בייבוא הלידים" }
  }
}
