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
      whatsappBlocked: boolean
      notes: string | null
      irrelevant: boolean
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
        whatsappBlocked: r.whatsappBlocked,
        notes: r.notes,
        irrelevant: r.irrelevant,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch (err) {
    console.error("[listOutreachLeadsAction]", err)
    return { ok: false, error: "שגיאה בטעינת לידים" }
  }
}

export async function toggleOutreachWhatsAppBlockedAction(
  id: string,
): Promise<ActionResult<{ id: string; whatsappBlocked: boolean }>> {
  try {
    const existing = await prisma.outreachLead.findUnique({
      where: { id },
      select: { id: true, whatsappBlocked: true },
    })
    if (!existing) return { ok: false, error: "ליד לא נמצא" }

    const updated = await prisma.outreachLead.update({
      where: { id },
      data: { whatsappBlocked: !existing.whatsappBlocked },
      select: { id: true, whatsappBlocked: true },
    })
    revalidatePath("/outreach-leads")
    return { ok: true, data: updated }
  } catch (err) {
    console.error("[toggleOutreachWhatsAppBlockedAction]", err)
    return { ok: false, error: "שגיאה בעדכון חסימת וואטסאפ" }
  }
}

export async function updateOutreachLeadNotesAction(
  id: string,
  notes: string,
  irrelevant?: boolean,
): Promise<
  ActionResult<{ id: string; notes: string | null; irrelevant: boolean }>
> {
  try {
    const trimmed = String(notes ?? "").trim()
    const data: { notes: string | null; irrelevant?: boolean } = {
      notes: trimmed || null,
    }
    if (typeof irrelevant === "boolean") {
      data.irrelevant = irrelevant
    }
    const updated = await prisma.outreachLead.update({
      where: { id },
      data,
      select: { id: true, notes: true, irrelevant: true },
    })
    revalidatePath("/outreach-leads")
    return { ok: true, data: updated }
  } catch (err) {
    console.error("[updateOutreachLeadNotesAction]", err)
    return { ok: false, error: "שגיאה בשמירת ההערות" }
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

/** סימון ליד כלא רלוונטי (מחיקה רכה — לא נמחק מה-DB) */
export async function markOutreachLeadIrrelevantAction(
  id: string,
): Promise<ActionResult<{ id: string; irrelevant: boolean }>> {
  try {
    const updated = await prisma.outreachLead.update({
      where: { id },
      data: { irrelevant: true },
      select: { id: true, irrelevant: true },
    })
    revalidatePath("/outreach-leads")
    return { ok: true, data: updated }
  } catch (err) {
    console.error("[markOutreachLeadIrrelevantAction]", err)
    return { ok: false, error: "שגיאה בסימון הליד כלא רלוונטי" }
  }
}

/** עדכון רלוונטיות לידי שיווק בבulk */
export async function bulkUpdateOutreachLeadRelevanceAction(input: {
  leadIds: string[]
  relevant: boolean
}): Promise<ActionResult<{ updated: number }>> {
  const leadIds = [...new Set(input.leadIds.filter(Boolean))]
  if (!leadIds.length) {
    return { ok: false, error: "לא נבחרו לידים" }
  }

  try {
    const irrelevant = !input.relevant
    const result = await prisma.outreachLead.updateMany({
      where: {
        id: { in: leadIds },
        irrelevant: !irrelevant,
      },
      data: { irrelevant },
    })
    revalidatePath("/outreach-leads")
    return { ok: true, data: { updated: result.count } }
  } catch (err) {
    console.error("[bulkUpdateOutreachLeadRelevanceAction]", err)
    return { ok: false, error: "שגיאה בעדכון רלוונטיות הלידים" }
  }
}

/** מחיקה לצמיתות — בדרך כלל ללידים שכבר סומנו לא רלוונטיים */
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

/** מוחק לצמיתות את כל הלידים המסומנים כלא רלוונטיים */
export async function deleteAllIrrelevantOutreachLeadsAction(): Promise<
  ActionResult<{ deleted: number }>
> {
  try {
    const result = await prisma.outreachLead.deleteMany({
      where: { irrelevant: true },
    })
    revalidatePath("/outreach-leads")
    return { ok: true, data: { deleted: result.count } }
  } catch (err) {
    console.error("[deleteAllIrrelevantOutreachLeadsAction]", err)
    return { ok: false, error: "שגיאה במחיקת הלידים הלא רלוונטיים" }
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
  ActionResult<{
    imported: number
    skipped: number
    keptIrrelevant: number
  }>
> {
  let imported = 0
  let skipped = 0
  let keptIrrelevant = 0

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
        select: { id: true, irrelevant: true },
      })

      /** מספר שכבר סומן לא רלוונטי (גם בקטגוריה אחרת) — נשמר כלא רלוונטי */
      const phoneWasIrrelevant = existing?.irrelevant
        ? true
        : Boolean(
            await prisma.outreachLead.findFirst({
              where: { phone, irrelevant: true },
              select: { id: true },
            }),
          )

      if (existing) {
        await prisma.outreachLead.update({
          where: { id: existing.id },
          data: {
            name,
            organization,
            category,
            // לא מאפסים irrelevant בייבוא חוזר
          },
        })
        if (existing.irrelevant) keptIrrelevant++
      } else {
        await prisma.outreachLead.create({
          data: {
            name,
            phone,
            organization,
            category,
            irrelevant: phoneWasIrrelevant,
          },
        })
        if (phoneWasIrrelevant) keptIrrelevant++
      }
      imported++
    }
    revalidatePath("/outreach-leads")
    return { ok: true, data: { imported, skipped, keptIrrelevant } }
  } catch (err) {
    console.error("[importOutreachLeadsAction]", err)
    return { ok: false, error: "שגיאה בייבוא הלידים" }
  }
}
