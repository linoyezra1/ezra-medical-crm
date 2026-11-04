import { readFile, mkdir, writeFile } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db"
import {
  certificateTemplateDefaultFilePath,
  certificateTemplateFilePath,
  defaultCertificateTemplate,
  normalizeCertificateTemplate,
  type CertificateTemplate,
} from "@/lib/certificate-template"

/**
 * טוען תבנית תעודה: DB קודם (שריד לדיפלוי), אחר כך קובץ מקומי, אחר כך ברירת מחדל.
 */
export async function loadStoredCertificateTemplate(
  templateType?: string | null,
): Promise<CertificateTemplate> {
  const type = String(templateType || "")
    .trim()
    .toUpperCase()
  const isDefault = !type || type === "REGULAR"

  if (isDefault) {
    try {
      const settings = await prisma.settings.findUnique({
        where: { id: "default" },
        select: { certificateTemplateJson: true },
      })
      const raw = settings?.certificateTemplateJson?.trim()
      if (raw) {
        return normalizeCertificateTemplate(JSON.parse(raw))
      }
    } catch (err) {
      console.error("[loadStoredCertificateTemplate] DB read failed", err)
    }
  }

  const candidates = [
    certificateTemplateFilePath(templateType),
    certificateTemplateDefaultFilePath(),
  ]
  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, "utf8")
      const fromDisk = normalizeCertificateTemplate(JSON.parse(raw))
      // העברה חד-פעמית מקובץ מקומי ל־DB (אם עדיין ריק)
      if (isDefault) {
        void persistTemplateJsonQuietly(JSON.stringify(fromDisk))
      }
      return fromDisk
    } catch {
      /* try next */
    }
  }

  return defaultCertificateTemplate()
}

async function persistTemplateJsonQuietly(json: string) {
  try {
    await prisma.settings.upsert({
      where: { id: "default" },
      create: { id: "default", certificateTemplateJson: json },
      update: { certificateTemplateJson: json },
    })
  } catch (err) {
    console.warn("[certificate-template-store] auto-persist failed", err)
  }
}

/**
 * שומר תבנית ל־DB (מקור האמת בפרודקשן) + קובץ מקומי כגיבוי לפיתוח.
 */
export async function saveStoredCertificateTemplate(
  template: CertificateTemplate,
): Promise<CertificateTemplate> {
  const normalized = normalizeCertificateTemplate(template)
  const json = JSON.stringify(normalized)

  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      certificateTemplateJson: json,
    },
    update: {
      certificateTemplateJson: json,
    },
  })

  try {
    const filePath = certificateTemplateFilePath()
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(normalized, null, 2), "utf8")
  } catch (err) {
    // בפרודקשן דיסק עלול להיות read-only — DB כבר נשמר
    console.warn("[saveStoredCertificateTemplate] disk write skipped", err)
  }

  return normalized
}
