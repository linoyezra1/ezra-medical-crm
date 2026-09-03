"use server"

import { mkdir, unlink, writeFile } from "fs/promises"
import path from "path"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { normalizeBatchName } from "@/lib/certificates-hub"
import {
  buildStoredFileKey,
  COHORT_DOCS_REL_DIR,
  COHORT_FILE_ONLY_SESSION_NUMBER,
  cohortDocStoredPath,
  cohortDocsUploadDir,
  formatCohortSessionDuration,
  isAllowedCohortDocFile,
  type CohortDocumentationRow,
  type CohortSessionDraft,
} from "@/lib/cohort-documentation"
import { formatInJerusalem } from "@/lib/timezone"

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function mapRow(row: {
  id: string
  cohortName: string
  sessionNumber: number | null
  sessionDate: Date
  instructorName: string | null
  durationHours: string | null
  notes: string | null
  isPaid: boolean
  paidAmount: number | null
  fileName: string
  fileUrl: string
  driveUrl: string | null
  fileSize: number | null
  leadId: string | null
  createdAt: Date
}): CohortDocumentationRow {
  const { date } = formatInJerusalem(row.sessionDate)
  return {
    id: row.id,
    cohortName: row.cohortName,
    sessionNumber: row.sessionNumber,
    sessionDate: date || row.sessionDate.toISOString().slice(0, 10),
    instructorName: row.instructorName,
    durationHours: row.durationHours,
    notes: row.notes,
    isPaid: row.isPaid,
    paidAmount: row.paidAmount,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    driveUrl: row.driveUrl,
    fileSize: row.fileSize,
    leadId: row.leadId,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listCohortDocumentationAction(input?: {
  cohortName?: string
  query?: string
}): Promise<ActionResult<CohortDocumentationRow[]>> {
  try {
    const cohortFilter = normalizeBatchName(input?.cohortName)
    const q = String(input?.query ?? "")
      .trim()
      .toLowerCase()

    const rows = await prisma.cohortDocumentation.findMany({
      where: cohortFilter ? { cohortName: cohortFilter } : undefined,
      orderBy: [{ sessionDate: "desc" }, { createdAt: "desc" }],
    })

    const filtered = q
      ? rows.filter((r) => {
          const hay =
            `${r.cohortName} ${r.instructorName ?? ""} ${r.fileName} ${r.notes ?? ""} ${r.durationHours ?? ""} ${r.isPaid ? "שולם" : "לא שולם"} ${r.paidAmount ?? ""}`.toLowerCase()
          return hay.includes(q)
        })
      : rows

    return { ok: true, data: filtered.map(mapRow) }
  } catch (err) {
    console.error("[listCohortDocumentationAction]", err)
    return { ok: false, error: "שגיאה בטעינת תיעוד מחזורים" }
  }
}

export async function listCohortNameOptionsAction(): Promise<
  ActionResult<string[]>
> {
  try {
    const [batches, docs] = await Promise.all([
      prisma.certificateBatch.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.cohortDocumentation.findMany({
        select: { cohortName: true },
        distinct: ["cohortName"],
        orderBy: { cohortName: "asc" },
      }),
    ])

    const names = new Set<string>()
    for (const b of batches) {
      const n = normalizeBatchName(b.name)
      if (n) names.add(n)
    }
    for (const d of docs) {
      const n = normalizeBatchName(d.cohortName)
      if (n) names.add(n)
    }

    return {
      ok: true,
      data: [...names].sort((a, b) => a.localeCompare(b, "he")),
    }
  } catch (err) {
    console.error("[listCohortNameOptionsAction]", err)
    return { ok: false, error: "שגיאה בטעינת רשימת מחזורים" }
  }
}

export async function uploadCohortDocumentationAction(
  formData: FormData,
): Promise<ActionResult<{ ids: string[]; count: number }>> {
  try {
    const cohortName = normalizeBatchName(
      String(formData.get("cohortName") ?? ""),
    )
    if (!cohortName) {
      return { ok: false, error: "יש לבחור או להזין שם מחזור" }
    }

    let sessions: CohortSessionDraft[] = []
    const sessionsJson = String(formData.get("sessionsJson") ?? "").trim()
    if (sessionsJson) {
      try {
        const parsed = JSON.parse(sessionsJson) as CohortSessionDraft[]
        if (Array.isArray(parsed)) sessions = parsed
      } catch {
        return { ok: false, error: "נתוני מפגשים לא תקינים" }
      }
    }

    if (!sessions.length) {
      const sessionDateRaw = String(formData.get("sessionDate") ?? "").trim()
      if (!sessionDateRaw) {
        return { ok: false, error: "יש לבחור תאריך מפגש" }
      }
      sessions = [
        {
          date: sessionDateRaw,
          timeFrom: "",
          timeTo: "",
          hours: String(formData.get("durationHours") ?? "").trim(),
        },
      ]
    }

    const parsedSessions = sessions.map((s, index) => {
      const dateRaw = String(s.date ?? "").trim()
      if (!dateRaw) {
        throw new Error(`MISSING_DATE:${index + 1}`)
      }
      const sessionDate = new Date(`${dateRaw}T12:00:00`)
      if (Number.isNaN(sessionDate.getTime())) {
        throw new Error(`INVALID_DATE:${index + 1}`)
      }
      return {
        sessionNumber: index + 1,
        sessionDate,
        durationHours: formatCohortSessionDuration({
          timeFrom: s.timeFrom,
          timeTo: s.timeTo,
          hours: s.hours,
        }),
      }
    })

    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "יש לבחור קובץ Excel/CSV" }
    }
    if (!isAllowedCohortDocFile(file.name)) {
      return {
        ok: false,
        error: "סוג קובץ לא נתמך — רק .xlsx, .xls, .csv",
      }
    }

    const instructorName =
      String(formData.get("instructorName") ?? "").trim() || null
    const notes = String(formData.get("notes") ?? "").trim() || null
    const driveUrl = String(formData.get("driveUrl") ?? "").trim() || null
    const leadId = String(formData.get("leadId") ?? "").trim() || null
    const isPaid = formData.get("isPaid") === "true"
    const paidAmountRaw = String(formData.get("paidAmount") ?? "").trim()
    const paidAmount = paidAmountRaw ? Number(paidAmountRaw) : null

    if (isPaid) {
      if (paidAmount == null || Number.isNaN(paidAmount) || paidAmount <= 0) {
        return { ok: false, error: "יש להזין סכום תשלום תקין כשהמחזור מסומן כשולם" }
      }
    }

    if (leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true },
      })
      if (!lead) return { ok: false, error: "ההדרכה שנבחרה לא נמצאה" }
    }

    const storedKey = buildStoredFileKey(file.name)
    const relativeUrl = path.posix.join(COHORT_DOCS_REL_DIR, storedKey)
    const absolutePath = cohortDocStoredPath(relativeUrl)

    await mkdir(cohortDocsUploadDir(), { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(absolutePath, buffer)

    const created = await prisma.$transaction(
      parsedSessions.map((session, index) =>
        prisma.cohortDocumentation.create({
          data: {
            cohortName,
            sessionNumber: session.sessionNumber,
            sessionDate: session.sessionDate,
            instructorName,
            durationHours: session.durationHours,
            notes,
            isPaid: isPaid && index === 0,
            paidAmount: isPaid && index === 0 ? paidAmount : null,
            fileName: file.name,
            fileUrl: relativeUrl,
            driveUrl,
            fileSize: file.size,
            leadId,
          },
          select: { id: true },
        }),
      ),
    )

    revalidatePath("/certificates")
    revalidatePath("/certificates/cohort-docs")
    revalidatePath("/certificates/cohort-docs", "layout")
    return {
      ok: true,
      data: { ids: created.map((r) => r.id), count: created.length },
    }
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.startsWith("MISSING_DATE:")) {
        const n = err.message.split(":")[1]
        return { ok: false, error: `יש לבחור תאריך למפגש ${n}` }
      }
      if (err.message.startsWith("INVALID_DATE:")) {
        const n = err.message.split(":")[1]
        return { ok: false, error: `תאריך לא תקין למפגש ${n}` }
      }
    }
    console.error("[uploadCohortDocumentationAction]", err)
    return { ok: false, error: "שגיאה בהעלאת התיעוד" }
  }
}

export async function addCohortExcelFilesAction(
  formData: FormData,
): Promise<ActionResult<{ ids: string[]; count: number }>> {
  try {
    const cohortName = normalizeBatchName(
      String(formData.get("cohortName") ?? ""),
    )
    if (!cohortName) {
      return { ok: false, error: "שם מחזור חסר" }
    }

    const files = formData
      .getAll("files")
      .concat(formData.getAll("file"))
      .filter((f): f is File => f instanceof File && f.size > 0)

    if (!files.length) {
      return { ok: false, error: "יש לבחור לפחות קובץ Excel/CSV אחד" }
    }

    for (const file of files) {
      if (!isAllowedCohortDocFile(file.name)) {
        return {
          ok: false,
          error: `סוג קובץ לא נתמך (${file.name}) — רק .xlsx, .xls, .csv`,
        }
      }
    }

    const notes = String(formData.get("notes") ?? "").trim() || null
    const driveUrl = String(formData.get("driveUrl") ?? "").trim() || null
    const sessionDate = new Date()

    await mkdir(cohortDocsUploadDir(), { recursive: true })

    const createdIds: string[] = []
    for (const file of files) {
      const storedKey = buildStoredFileKey(file.name)
      const relativeUrl = path.posix.join(COHORT_DOCS_REL_DIR, storedKey)
      const absolutePath = cohortDocStoredPath(relativeUrl)
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(absolutePath, buffer)

      const created = await prisma.cohortDocumentation.create({
        data: {
          cohortName,
          sessionDate,
          notes,
          driveUrl,
          fileName: file.name,
          fileUrl: relativeUrl,
          fileSize: file.size,
          sessionNumber: COHORT_FILE_ONLY_SESSION_NUMBER,
        },
        select: { id: true },
      })
      createdIds.push(created.id)
    }

    revalidatePath("/certificates")
    revalidatePath("/certificates/cohort-docs")
    revalidatePath("/certificates/cohort-docs", "layout")
    return { ok: true, data: { ids: createdIds, count: createdIds.length } }
  } catch (err) {
    console.error("[addCohortExcelFilesAction]", err)
    return { ok: false, error: "שגיאה בהעלאת קבצי האקסל" }
  }
}

export async function updateCohortDocumentationAction(
  formData: FormData,
): Promise<ActionResult<CohortDocumentationRow>> {
  try {
    const id = String(formData.get("id") ?? "").trim()
    if (!id) return { ok: false, error: "מזהה רשומה חסר" }

    const existing = await prisma.cohortDocumentation.findUnique({
      where: { id },
    })
    if (!existing) return { ok: false, error: "הרשומה לא נמצאה" }

    const cohortName = normalizeBatchName(
      String(formData.get("cohortName") ?? ""),
    )
    if (!cohortName) {
      return { ok: false, error: "יש לבחור או להזין שם מחזור" }
    }

    const sessionDateRaw = String(formData.get("sessionDate") ?? "").trim()
    if (!sessionDateRaw) {
      return { ok: false, error: "יש לבחור תאריך מפגש" }
    }
    const sessionDate = new Date(`${sessionDateRaw}T12:00:00`)
    if (Number.isNaN(sessionDate.getTime())) {
      return { ok: false, error: "תאריך לא תקין" }
    }

    const sessionNumberRaw = String(formData.get("sessionNumber") ?? "").trim()
    const sessionNumber = sessionNumberRaw
      ? Number.parseInt(sessionNumberRaw, 10)
      : null
    if (
      sessionNumberRaw &&
      (sessionNumber == null || Number.isNaN(sessionNumber) || sessionNumber < 1)
    ) {
      return { ok: false, error: "מספר מפגש לא תקין" }
    }

    const durationHours = formatCohortSessionDuration({
      timeFrom: String(formData.get("timeFrom") ?? ""),
      timeTo: String(formData.get("timeTo") ?? ""),
      hours: String(formData.get("hours") ?? ""),
    })

    const instructorName =
      String(formData.get("instructorName") ?? "").trim() || null
    const notes = String(formData.get("notes") ?? "").trim() || null
    const driveUrl = String(formData.get("driveUrl") ?? "").trim() || null

    let fileName = existing.fileName
    let fileUrl = existing.fileUrl
    let fileSize = existing.fileSize
    const oldFileUrl = existing.fileUrl

    const file = formData.get("file")
    if (file instanceof File && file.size > 0) {
      if (!isAllowedCohortDocFile(file.name)) {
        return {
          ok: false,
          error: "סוג קובץ לא נתמך — רק .xlsx, .xls, .csv",
        }
      }
      const storedKey = buildStoredFileKey(file.name)
      const relativeUrl = path.posix.join(COHORT_DOCS_REL_DIR, storedKey)
      const absolutePath = cohortDocStoredPath(relativeUrl)

      await mkdir(cohortDocsUploadDir(), { recursive: true })
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(absolutePath, buffer)

      fileName = file.name
      fileUrl = relativeUrl
      fileSize = file.size
    }

    const updated = await prisma.cohortDocumentation.update({
      where: { id },
      data: {
        cohortName,
        sessionNumber,
        sessionDate,
        instructorName,
        durationHours,
        notes,
        driveUrl,
        fileName,
        fileUrl,
        fileSize,
      },
    })

    if (fileUrl !== oldFileUrl) {
      const othersWithOldFile = await prisma.cohortDocumentation.count({
        where: { fileUrl: oldFileUrl },
      })
      if (othersWithOldFile === 0) {
        try {
          await unlink(cohortDocStoredPath(oldFileUrl))
        } catch {
          // file may already be missing
        }
      }
    }

    revalidatePath("/certificates")
    revalidatePath("/certificates/cohort-docs")
    revalidatePath("/certificates/cohort-docs", "layout")
    return { ok: true, data: mapRow(updated) }
  } catch (err) {
    console.error("[updateCohortDocumentationAction]", err)
    return { ok: false, error: "שגיאה בעדכון התיעוד" }
  }
}

/** תשלום אחד לכל תיעוד המחזור — לא פר מפגש */
export async function updateCohortPaymentAction(input: {
  cohortName: string
  isPaid: boolean
  paidAmount?: number | null
}): Promise<ActionResult<{ cohortName: string }>> {
  try {
    const cohortName = normalizeBatchName(input.cohortName)
    if (!cohortName) return { ok: false, error: "שם מחזור חסר" }

    const isPaid = Boolean(input.isPaid)
    const paidAmount =
      input.paidAmount != null && Number.isFinite(Number(input.paidAmount))
        ? Number(input.paidAmount)
        : null

    if (isPaid) {
      if (paidAmount == null || Number.isNaN(paidAmount) || paidAmount <= 0) {
        return {
          ok: false,
          error: "יש להזין סכום תשלום תקין כשהמחזור מסומן כשולם",
        }
      }
    }

    const rows = await prisma.cohortDocumentation.findMany({
      where: { cohortName },
      orderBy: [{ sessionDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, sessionNumber: true },
    })
    if (!rows.length) return { ok: false, error: "לא נמצאו רשומות למחזור" }

    const primary =
      rows.find((r) => r.sessionNumber !== COHORT_FILE_ONLY_SESSION_NUMBER) ??
      rows[0]!

    await prisma.$transaction([
      prisma.cohortDocumentation.updateMany({
        where: { cohortName, id: { not: primary.id } },
        data: { isPaid: false, paidAmount: null },
      }),
      prisma.cohortDocumentation.update({
        where: { id: primary.id },
        data: {
          isPaid,
          paidAmount: isPaid ? paidAmount : null,
        },
      }),
    ])

    revalidatePath("/certificates")
    revalidatePath("/certificates/cohort-docs")
    revalidatePath("/certificates/cohort-docs", "layout")
    return { ok: true, data: { cohortName } }
  } catch (err) {
    console.error("[updateCohortPaymentAction]", err)
    return { ok: false, error: "שגיאה בעדכון תשלום המחזור" }
  }
}

export async function deleteCohortDocumentationAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const existing = await prisma.cohortDocumentation.findUnique({
      where: { id },
    })
    if (!existing) return { ok: false, error: "הרשומה לא נמצאה" }

    await prisma.cohortDocumentation.delete({ where: { id } })

    const othersWithSameFile = await prisma.cohortDocumentation.count({
      where: { fileUrl: existing.fileUrl },
    })
    if (othersWithSameFile === 0) {
      try {
        await unlink(cohortDocStoredPath(existing.fileUrl))
      } catch {
        // file may already be missing
      }
    }

    revalidatePath("/certificates")
    revalidatePath("/certificates/cohort-docs")
    revalidatePath("/certificates/cohort-docs", "layout")
    return { ok: true, data: { id } }
  } catch (err) {
    console.error("[deleteCohortDocumentationAction]", err)
    return { ok: false, error: "שגיאה במחיקת התיעוד" }
  }
}

export async function getCohortDocumentationFileMetaAction(id: string): Promise<
  ActionResult<{
    fileName: string
    fileUrl: string
    fileSize: number | null
  }>
> {
  try {
    const row = await prisma.cohortDocumentation.findUnique({
      where: { id },
      select: { fileName: true, fileUrl: true, fileSize: true },
    })
    if (!row) return { ok: false, error: "הרשומה לא נמצאה" }
    return { ok: true, data: row }
  } catch (err) {
    console.error("[getCohortDocumentationFileMetaAction]", err)
    return { ok: false, error: "שגיאה בטעינת הקובץ" }
  }
}
