import { readFile, mkdir, writeFile } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db"
import {
  CERTIFICATE_TEMPLATE_TYPES,
  type CertificateTemplateType,
} from "@/lib/certificate-issuance"
import {
  certificateTemplateDefaultFilePath,
  certificateTemplateFilePath,
  defaultCertificateTemplate,
  normalizeCertificateTemplate,
  type CertificateTemplate,
} from "@/lib/certificate-template"

type TemplateMap = Partial<Record<CertificateTemplateType, CertificateTemplate>>

function normalizeTemplateType(
  templateType?: string | null,
): CertificateTemplateType {
  const raw = String(templateType || "REGULAR")
    .trim()
    .toUpperCase()
  const match = CERTIFICATE_TEMPLATE_TYPES.find((t) => t.value === raw)
  return match?.value ?? "REGULAR"
}

function parseTemplateMap(raw: string | null | undefined): TemplateMap {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const map: TemplateMap = {}
    for (const opt of CERTIFICATE_TEMPLATE_TYPES) {
      if (parsed[opt.value] != null) {
        map[opt.value] = normalizeCertificateTemplate(parsed[opt.value])
      }
    }
    return map
  } catch {
    return {}
  }
}

async function readSettingsTemplates(): Promise<{
  map: TemplateMap
  legacyRegular: CertificateTemplate | null
}> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: {
        certificateTemplatesJson: true,
        certificateTemplateJson: true,
      },
    })
    const map = parseTemplateMap(settings?.certificateTemplatesJson)
    let legacyRegular: CertificateTemplate | null = null
    const legacyRaw = settings?.certificateTemplateJson?.trim()
    if (legacyRaw) {
      try {
        legacyRegular = normalizeCertificateTemplate(JSON.parse(legacyRaw))
      } catch {
        legacyRegular = null
      }
    }
    if (!map.REGULAR && legacyRegular) {
      map.REGULAR = legacyRegular
    }
    return { map, legacyRegular }
  } catch (err) {
    console.error("[certificate-template-store] DB read failed", err)
    return { map: {}, legacyRegular: null }
  }
}

async function writeSettingsTemplates(map: TemplateMap): Promise<void> {
  const serializable: Record<string, CertificateTemplate> = {}
  for (const opt of CERTIFICATE_TEMPLATE_TYPES) {
    if (map[opt.value]) serializable[opt.value] = map[opt.value]!
  }
  const templatesJson = JSON.stringify(serializable)
  const regularJson = map.REGULAR
    ? JSON.stringify(map.REGULAR)
    : undefined

  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      certificateTemplatesJson: templatesJson,
      ...(regularJson ? { certificateTemplateJson: regularJson } : {}),
    },
    update: {
      certificateTemplatesJson: templatesJson,
      ...(regularJson ? { certificateTemplateJson: regularJson } : {}),
    },
  })
}

async function loadFromDisk(
  templateType: CertificateTemplateType,
): Promise<CertificateTemplate | null> {
  const candidates = [
    certificateTemplateFilePath(templateType),
    certificateTemplateDefaultFilePath(),
  ]
  // לסוג שאינו REGULAR — לא נופלים אוטומטית לברירת מחדל של REGULAR מהדיסק
  // אלא אם אין קובץ ייעודי; ננסה קודם ייעודי בלבד
  const paths =
    templateType === "REGULAR"
      ? candidates
      : [certificateTemplateFilePath(templateType)]

  for (const filePath of paths) {
    try {
      const raw = await readFile(filePath, "utf8")
      return normalizeCertificateTemplate(JSON.parse(raw))
    } catch {
      /* try next */
    }
  }
  return null
}

function labeledDefault(templateType: CertificateTemplateType): CertificateTemplate {
  const base = defaultCertificateTemplate()
  const label =
    CERTIFICATE_TEMPLATE_TYPES.find((t) => t.value === templateType)?.label ||
    templateType
  return {
    ...base,
    name: `תעודת ${label}`,
  }
}

/**
 * טוען תבנית לפי סוג: DB → דיסק → ברירת מחדל (או שיבוט מ־REGULAR אם קיים).
 */
export async function loadStoredCertificateTemplate(
  templateType?: string | null,
): Promise<CertificateTemplate> {
  const type = normalizeTemplateType(templateType)
  const { map } = await readSettingsTemplates()

  if (map[type]) return map[type]!

  const fromDisk = await loadFromDisk(type)
  if (fromDisk) {
    // שמירה שקטה ל־DB כדי שישרוד דיפלוי
    map[type] = fromDisk
    void writeSettingsTemplates(map).catch((err) =>
      console.warn("[certificate-template-store] auto-persist failed", err),
    )
    return fromDisk
  }

  // סוג חדש בלי תבנית — שיבוט מ־REGULAR אם יש, אחרת ברירת מחדל
  if (type !== "REGULAR" && map.REGULAR) {
    return {
      ...normalizeCertificateTemplate(map.REGULAR),
      name: labeledDefault(type).name,
    }
  }

  if (type !== "REGULAR") {
    const regularDisk = await loadFromDisk("REGULAR")
    if (regularDisk) {
      return {
        ...normalizeCertificateTemplate(regularDisk),
        name: labeledDefault(type).name,
      }
    }
  }

  return labeledDefault(type)
}

/**
 * שומר תבנית לסוג מסוים ב־DB (+ גיבוי דיסק בפיתוח).
 */
export async function saveStoredCertificateTemplate(
  template: CertificateTemplate,
  templateType?: string | null,
): Promise<CertificateTemplate> {
  const type = normalizeTemplateType(templateType)
  const normalized = normalizeCertificateTemplate(template)
  const { map } = await readSettingsTemplates()
  map[type] = normalized
  await writeSettingsTemplates(map)

  try {
    const filePath = certificateTemplateFilePath(type)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(normalized, null, 2), "utf8")
  } catch (err) {
    console.warn("[saveStoredCertificateTemplate] disk write skipped", err)
  }

  return normalized
}

/** אילו סוגי תבנית כבר נשמרו ב־DB */
export async function listStoredCertificateTemplateTypes(): Promise<
  CertificateTemplateType[]
> {
  const { map } = await readSettingsTemplates()
  return CERTIFICATE_TEMPLATE_TYPES.map((t) => t.value).filter(
    (value) => Boolean(map[value]),
  )
}
