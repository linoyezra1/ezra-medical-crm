"use server"

import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db"
import {
  buildPilotCertificatesPdf,
  certificateValidUntil,
  resolveCertificateCourseDate,
  type PilotCertificateFields,
} from "@/lib/certificate-pdf-pilot"
import {
  certificateAssetsDir,
  CERTIFICATE_NUMBER_PREVIEW_PLACEHOLDER,
  defaultCertificateTemplate,
  normalizeCertificateTemplate,
  SAMPLE_PREVIEW_FIELDS,
  type CertificatePreviewFields,
  type CertificateTemplate,
} from "@/lib/certificate-template"
import {
  CERTIFICATE_TEMPLATE_TYPES,
  type CertificateTemplateType,
} from "@/lib/certificate-issuance"
import {
  listStoredCertificateTemplateTypes,
  loadStoredCertificateTemplate,
  saveStoredCertificateTemplate,
} from "@/lib/certificate-template-store"
import {
  certificateScopeForSheet,
  formatCertificateHoursScope,
  resolveParticipantCertificateCourseType,
} from "@/lib/course-type"

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function normalizeType(
  templateType?: string | null,
): CertificateTemplateType {
  const raw = String(templateType || "REGULAR")
    .trim()
    .toUpperCase()
  const match = CERTIFICATE_TEMPLATE_TYPES.find((t) => t.value === raw)
  return match?.value ?? "REGULAR"
}

export async function getCertificateTemplateAction(
  templateType?: string | null,
): Promise<ActionResult<CertificateTemplate>> {
  try {
    const template = await loadStoredCertificateTemplate(
      normalizeType(templateType),
    )
    return { ok: true, data: template }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "טעינת תבנית נכשלה",
    }
  }
}

export async function listCertificateTemplateTypesAction(): Promise<
  ActionResult<{
    types: typeof CERTIFICATE_TEMPLATE_TYPES
    savedTypes: CertificateTemplateType[]
  }>
> {
  try {
    const savedTypes = await listStoredCertificateTemplateTypes()
    return {
      ok: true,
      data: { types: CERTIFICATE_TEMPLATE_TYPES, savedTypes },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "טעינת סוגי תבנית נכשלה",
    }
  }
}

export async function saveCertificateTemplateAction(
  template: CertificateTemplate,
  templateType?: string | null,
): Promise<ActionResult<CertificateTemplate>> {
  try {
    const normalized = await saveStoredCertificateTemplate(
      template,
      normalizeType(templateType),
    )
    return { ok: true, data: normalized }
  } catch (err) {
    console.error("[saveCertificateTemplateAction]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שמירת תבנית נכשלה",
    }
  }
}

export async function resetCertificateTemplateAction(
  templateType?: string | null,
): Promise<ActionResult<CertificateTemplate>> {
  const type = normalizeType(templateType)
  const label =
    CERTIFICATE_TEMPLATE_TYPES.find((t) => t.value === type)?.label || type
  const base = defaultCertificateTemplate()
  return saveCertificateTemplateAction(
    { ...base, name: `תעודת ${label}` },
    type,
  )
}

function isImageFile(name: string, mime: string): boolean {
  const ext = path.extname(name).toLowerCase()
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return true
  return /image\/(png|jpeg|jpg|webp)/i.test(mime)
}

function detectImageExtension(bytes: Uint8Array, fallbackExt: string): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return ".png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return ".jpg"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return ".webp"
  }
  const ext = path.extname(fallbackExt).toLowerCase()
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext
  }
  return ".png"
}

export async function uploadCertificateAssetAction(
  formData: FormData,
): Promise<ActionResult<{ url: string; fileName: string }>> {
  try {
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return { ok: false, error: "לא נבחר קובץ" }
    }
    if (!isImageFile(file.name, file.type)) {
      return { ok: false, error: "יש להעלות תמונה (PNG / JPG / WEBP)" }
    }
    if (file.size > 8 * 1024 * 1024) {
      return { ok: false, error: "הקובץ גדול מדי (מקסימום 8MB)" }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = detectImageExtension(buffer, file.name)
    const stamp = Date.now().toString(36)
    const safeBase = String(file.name || "asset")
      .replace(/\.[^.]+$/, "")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim()
      .slice(0, 40) || "asset"
    const fileName = `${safeBase}-${stamp}${ext}`

    // בפרודקשן: Cloudinary כדי שהרקע/לוגו ישרוד דיפלוי
    try {
      const { isCloudinaryConfigured, uploadCertificateAssetImageToCloudinary } =
        await import("@/lib/cloudinary/certificates")
      if (isCloudinaryConfigured()) {
        const uploaded = await uploadCertificateAssetImageToCloudinary({
          bytes: buffer,
          fileName,
        })
        if (uploaded.ok) {
          return {
            ok: true,
            data: { url: uploaded.url, fileName },
          }
        }
        console.warn(
          "[uploadCertificateAssetAction] Cloudinary failed, falling back to disk",
          uploaded.error,
        )
      }
    } catch (cloudErr) {
      console.warn(
        "[uploadCertificateAssetAction] Cloudinary unavailable",
        cloudErr,
      )
    }

    const dir = certificateAssetsDir()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), buffer)

    return {
      ok: true,
      data: {
        url: `/certificates/assets/${fileName}`,
        fileName,
      },
    }
  } catch (err) {
    console.error("[uploadCertificateAssetAction]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "העלאת תמונה נכשלה",
    }
  }
}

export async function setCertificateBackgroundAction(
  formData: FormData,
  templateType?: string | null,
): Promise<ActionResult<CertificateTemplate>> {
  const uploaded = await uploadCertificateAssetAction(formData)
  if (!uploaded.ok) return uploaded

  const type = normalizeType(templateType)
  const current = await loadStoredCertificateTemplate(type)
  current.backgroundUrl = uploaded.data.url
  return saveCertificateTemplateAction(current, type)
}

export async function searchTraineesForCertificatePreviewAction(
  query: string,
): Promise<
  ActionResult<
    Array<{
      id: string
      fullName: string
      idNumber: string
      phone?: string
      source: "trainee" | "participant"
      preview: CertificatePreviewFields
    }>
  >
> {
  const q = String(query || "").trim()
  if (q.length < 2) {
    return { ok: false, error: "הקלידו לפחות 2 תווים לחיפוש מודרך" }
  }

  try {
    const [trainees, participants] = await Promise.all([
      prisma.trainee.findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { idNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        },
        take: 20,
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          idNumber: true,
          phone: true,
          participants: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              courseDate: true,
              courseType: true,
              isExternal: true,
              lead: {
                select: {
                  scheduledStart: true,
                  courseType: true,
                  courseTypeOther: true,
                },
              },
            },
          },
        },
      }),
      prisma.participant.findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { idNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        },
        take: 20,
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          idNumber: true,
          phone: true,
          courseDate: true,
          courseType: true,
          isExternal: true,
          lead: {
            select: {
              scheduledStart: true,
              courseType: true,
              courseTypeOther: true,
            },
          },
        },
      }),
    ])

    const rows: Array<{
      id: string
      fullName: string
      idNumber: string
      phone?: string
      source: "trainee" | "participant"
      preview: CertificatePreviewFields
    }> = []

    for (const t of trainees) {
      const p = t.participants[0]
      const preview = buildPreviewFromParticipantLike({
        id: p?.id || t.id,
        fullName: t.fullName,
        idNumber: t.idNumber,
        courseDate: p?.courseDate,
        courseType: p?.courseType,
        isExternal: p?.isExternal,
        lead: p?.lead,
      })
      rows.push({
        id: t.id,
        fullName: t.fullName,
        idNumber: t.idNumber || "",
        phone: t.phone || undefined,
        source: "trainee",
        preview,
      })
    }

    const traineeIds = new Set(trainees.map((t) => t.id))
    for (const p of participants) {
      if (traineeIds.has(p.id)) continue
      rows.push({
        id: p.id,
        fullName: p.fullName,
        idNumber: p.idNumber || "",
        phone: p.phone || undefined,
        source: "participant",
        preview: buildPreviewFromParticipantLike(p),
      })
    }

    rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "he"))
    return { ok: true, data: rows.slice(0, 25) }
  } catch (err) {
    console.error("[searchTraineesForCertificatePreviewAction]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "חיפוש מודרכים נכשל",
    }
  }
}

function buildPreviewFromParticipantLike(p: {
  id: string
  fullName: string
  idNumber?: string | null
  courseDate?: string | null
  courseType?: string | null
  isExternal?: boolean | null
  lead?: {
    scheduledStart?: Date | null
    courseType?: string | null
    courseTypeOther?: string | null
  } | null
}): CertificatePreviewFields {
  const cert = resolveParticipantCertificateCourseType({
    courseType: p.courseType,
    isExternal: Boolean(p.isExternal),
    lead: p.lead
      ? {
          courseType: p.lead.courseType || "",
          courseTypeOther: p.lead.courseTypeOther || "",
        }
      : undefined,
  })
  const hoursScope = certificateScopeForSheet(
    cert.courseType,
    cert.courseTypeOther,
  )
  const courseDate = resolveCertificateCourseDate(
    p.courseDate,
    p.lead?.scheduledStart,
  )

  return {
    fullName: (p.fullName || "").trim() || "—",
    idNumber: (p.idNumber || "").trim(),
    courseDate,
    hoursScope: formatCertificateHoursScope(hoursScope) || "",
    certificateNumber: CERTIFICATE_NUMBER_PREVIEW_PLACEHOLDER,
    validUntil: certificateValidUntil(courseDate),
  }
}

export async function previewCertificatePdfAction(input: {
  template?: CertificateTemplate
  fields?: CertificatePreviewFields
}): Promise<ActionResult<{ pdfBase64: string; fileName: string }>> {
  try {
    const template =
      input.template != null
        ? normalizeCertificateTemplate(input.template)
        : await loadStoredCertificateTemplate()
    const fields = input.fields || SAMPLE_PREVIEW_FIELDS
    const page: PilotCertificateFields = {
      fullName: fields.fullName,
      idNumber: fields.idNumber,
      courseDate: fields.courseDate,
      hoursScope: fields.hoursScope,
      certificateNumber: fields.certificateNumber,
      validUntil: fields.validUntil,
    }
    const pdfBytes = await buildPilotCertificatesPdf([page], template)
    return {
      ok: true,
      data: {
        pdfBase64: Buffer.from(pdfBytes).toString("base64"),
        fileName: `תצוגה-תעודה-${fields.fullName.replace(/\s+/g, "-") || "preview"}.pdf`,
      },
    }
  } catch (err) {
    console.error("[previewCertificatePdfAction]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "יצירת תצוגה נכשלה",
    }
  }
}
