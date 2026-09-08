import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db"
import { resolveParticipantCertifyingBodyOnCreate } from "@/lib/certifying-body"
import {
  getSheetsClient,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets/client"
import { parseSheetDateValue } from "@/lib/google-sheets/sheet-dates"
import {
  cleanParticipantPhone,
  indexParticipantsByIdNumber,
  isUsableParticipantIdNumber,
  normalizeParticipantIdNumber,
} from "@/lib/participant-identity"
import {
  buildMergedParticipantData,
  type ParticipantUpsertFields,
} from "@/lib/participant-upsert"
import { formatInJerusalem } from "@/lib/timezone"

const DEFAULT_WIX_SPREADSHEET_ID =
  "1vy5gL9PjLQ8scNHvHPHxAtCLfWDRZm0Lr4BfdBK3Nz4"
const DEFAULT_WIX_TAB_NAME = "WIX"

function getWixSpreadsheetId(): string {
  return process.env.WIX_SPREADSHEET_ID?.trim() || DEFAULT_WIX_SPREADSHEET_ID
}

/**
 * Wix registration sheet tab name (separate from certificates tab).
 * Env var: WIX_SHEET_TAB_NAME, default "WIX"
 * Returned with single-quote wrapping for Google Sheets API compatibility.
 */
function getWixTabName(): string {
  const raw = process.env.WIX_SHEET_TAB_NAME?.trim() || DEFAULT_WIX_TAB_NAME
  return `'${raw.replace(/'/g, "")}'`
}

/**
 * סדר עמודות קבוע בגיליון Wix — לפי אות העמודה, לא לפי חיפוש כותרת:
 * A חותמת | B שם מלא | C תעודת זהות | D תאריך קורס | E מייל | F טלפון |
 * G הערות / סוג קורס | H שם מארגן | I שביעות רצון | J תיק | K משוב | L trainingId
 */
const COL = {
  fullName: 1,
  idNumber: 2,
  courseDate: 3,
  email: 4,
  phone: 5,
  courseType: 6,
  organizer: 7,
  satisfied: 8,
  buyKit: 9,
  feedback: 10,
  trainingId: 11,
} as const

/**
 * תווים נסתרים שנפוצים בגיליונות בעברית ושוברים השוואת מזהים:
 * אפס-רוחב, BOM, סימני כיווניות (LRM/RLM), עטיפות דו-כיווניות ומקף רך.
 */
const INVISIBLE_CHARS =
  /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069\u00AD]/g

/** נוטציה מדעית שנוצרת כשעמודת ת״ז מעוצבת כמספר (5.81235E+08) */
const SCIENTIFIC_NOTATION = /^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/

/**
 * ניקוי מפתח/מזהה להשוואה מדויקת:
 * מסיר תווים נסתרים וכל רווח (כולל NBSP) — מזהים אינם מכילים רווחים.
 */
function cleanKey(val: unknown): string {
  return String(val ?? "")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, "")
}

/** טקסט אנושי מתא: מסיר תווים נסתרים, NBSP → רווח רגיל */
function cell(row: unknown[], index: number): string {
  return String(row[index] ?? "")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\u00A0/g, " ")
    .trim()
}

/** תאריך מגיליון → YYYY-MM-DD (null כשלא ניתן לפענוח) */
function toIsoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const d = parseSheetDateValue(value)
  if (!d) return null
  return formatInJerusalem(d).date || null
}

function isHeaderRow(row: unknown[]): boolean {
  const b = cell(row, COL.fullName).toLowerCase()
  const a = cell(row, 0).toLowerCase()
  const l = cell(row, COL.trainingId).toLowerCase()
  return (
    b === "שם מלא" ||
    b.includes("שם מלא") ||
    a.includes("חותמת") ||
    l === "trainingid" ||
    l === "training id"
  )
}

/**
 * ת״ז מהגיליון — מעדיף את הערך הגולמי (UNFORMATTED) על התצוגה,
 * כדי שעמודה מעוצבת כמספר לא תיקטע לנוטציה מדעית ותייצר ת״ז שגויה.
 */
function resolveSheetIdNumber(
  formattedCell: string,
  unformattedCell: unknown,
): { idNumber: string; warning: string | null } {
  // מספר גולמי — דיוק מלא, בלי עיגול/נוטציה
  if (
    typeof unformattedCell === "number" &&
    Number.isFinite(unformattedCell) &&
    Number.isInteger(unformattedCell)
  ) {
    return {
      idNumber: normalizeParticipantIdNumber(String(unformattedCell)),
      warning: null,
    }
  }

  const unformatted = cleanKey(unformattedCell)
  if (unformatted && /^\d+$/.test(unformatted)) {
    return {
      idNumber: normalizeParticipantIdNumber(unformatted),
      warning: null,
    }
  }

  const formatted = cleanKey(formattedCell)
  if (SCIENTIFIC_NOTATION.test(formatted) || SCIENTIFIC_NOTATION.test(unformatted)) {
    // לא מנחשים ספרות מנוטציה מדעית — עדיף לדלג ולהתריע
    return {
      idNumber: "",
      warning: "ת״ז נקראה בפורמט מדעי — יש לעצב את עמודה C כטקסט",
    }
  }

  return { idNumber: normalizeParticipantIdNumber(formatted), warning: null }
}

export type WixSyncResult = {
  ok: true
  added: number
  skipped: number
  updated: number
  /** שורות ששויכו לפי ת״ז אף שמזהה ההדרכה בגיליון חסר/שגוי */
  matchedByIdNumber: number
  /** התראות לתצוגה למשתמש (ת״ז לא קריאה, אין שורות למזהה ההדרכה וכו׳) */
  warnings: string[]
} | {
  ok: false
  error: string
}

type ParsedRow = {
  sheetRow: number
  fullName: string
  /** ת״ז מנורמלת — ריקה כשלא נקראה */
  idNumber: string
  courseDate: string | null
  email: string
  phone: string
  courseType: string | null
  organizerName: string | null
  satisfaction: string | null
  kitInterest: string | null
  feedback: string | null
}

/** דיווח חוזר של אותו אדם באותו גיליון — הערך החדש גובר (preferIncoming) */
function mergeParsedRows(prev: ParsedRow, next: ParsedRow): ParsedRow {
  return {
    sheetRow: next.sheetRow,
    fullName: next.fullName || prev.fullName,
    idNumber: next.idNumber || prev.idNumber,
    courseDate: next.courseDate || prev.courseDate,
    email: next.email || prev.email,
    phone: next.phone || prev.phone,
    courseType: next.courseType || prev.courseType,
    organizerName: next.organizerName || prev.organizerName,
    satisfaction: next.satisfaction || prev.satisfaction,
    kitInterest: next.kitInterest || prev.kitInterest,
    feedback: next.feedback || prev.feedback,
  }
}

function toUpsertFields(row: ParsedRow): ParticipantUpsertFields {
  return {
    fullName: row.fullName || undefined,
    idNumber: row.idNumber,
    phone: row.phone || undefined,
    email: row.email || undefined,
    courseDate: row.courseDate || undefined,
    organizerName: row.organizerName || undefined,
    courseType: row.courseType || undefined,
    satisfaction: row.satisfaction || undefined,
    kitInterest: row.kitInterest || undefined,
    feedback: row.feedback || undefined,
    source: "Wix",
  }
}

/**
 * קורא את גיליון הרישום של Wix ומשייך שורות להדרכה בשתי דרכים:
 *   1. מזהה ההדרכה בעמודה L (השיוך הישיר מהטופס) — יוצר ומעדכן.
 *   2. ת״ז שכבר קיימת כמשתתף בהדרכה — מעדכן ומתייג Wix גם כשעמודה L
 *      ריקה או מכילה מזהה של הדרכה אחרת (בחירה שגויה בטופס).
 * שיוך לפי ת״ז לא יוצר משתתפים חדשים, ומוגבל כדי שרישום של אותו אדם
 * בהדרכה אחרת לא ידרוס את הנתונים כאן: עמודה L ריקה — די בכך שתאריך
 * הגיליון אינו סותר את מועדי ההדרכה; עמודה L של הדרכה אחרת — נדרש
 * תאריך קורס זהה לאחד ממועדי ההדרכה.
 *
 * מילוי חוזר / דיווח חוזר — מעדכן את הקיים, לא יוצר שורה חדשה.
 * כל העבודה מול ה-DB מקובצת (מספר קבוע של סבבים) כדי למנוע Timeout
 * וייבוא חלקי־שקט בהדרכות עם הרבה משתתפים.
 */
export async function refreshParticipantsFromWix(
  trainingId: string,
): Promise<WixSyncResult> {
  if (!isGoogleSheetsConfigured()) {
    return { ok: false, error: "Google Sheets לא מוגדר" }
  }

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: trainingId },
      select: {
        id: true,
        deliveryMethod: true,
        scheduledStart: true,
        trainingSessions: { select: { date: true } },
      },
    })
    if (!lead) {
      return { ok: false, error: "ההדרכה לא נמצאה" }
    }

    // מועדי ההדרכה — הגבול לשיוך לפי ת״ז כשמזהה ההדרכה בגיליון לא תואם
    const leadDates = new Set<string>()
    if (lead.scheduledStart) {
      const d = formatInJerusalem(lead.scheduledStart).date
      if (d) leadDates.add(d)
    }
    for (const s of lead.trainingSessions) {
      const d = (s.date || "").trim()
      if (d) leadDates.add(d)
    }

    const sheets = await getSheetsClient()
    const spreadsheetId = getWixSpreadsheetId()
    const tab = getWixTabName()
    const range = `${tab}!A:L`

    // שתי קריאות לאותו טווח: תצוגה לטקסט/תאריכים, גולמי למספרים (ת״ז)
    const [formattedRes, unformattedRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        majorDimension: "ROWS",
        valueRenderOption: "FORMATTED_VALUE",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        majorDimension: "ROWS",
        valueRenderOption: "UNFORMATTED_VALUE",
      }),
    ])

    const allRows = formattedRes.data.values || []
    const rawRows = unformattedRes.data.values || []
    if (!allRows.length) {
      return {
        ok: true,
        added: 0,
        skipped: 0,
        updated: 0,
        matchedByIdNumber: 0,
        warnings: [],
      }
    }

    const headerOffset = isHeaderRow(allRows[0]) ? 1 : 0
    const dataRows = allRows.slice(headerOffset)

    const warnings: string[] = []
    const trainingKey = cleanKey(trainingId)

    // ------- שלב 1: משתתפי ההדרכה הקיימים — בסיס ההתאמה לפי ת״ז -------
    const existingRows = await prisma.participant.findMany({
      where: { leadId: trainingId },
    })
    const existingById = indexParticipantsByIdNumber(existingRows)

    type ExistingRow = (typeof existingRows)[number]
    const existingByPhone = new Map<string, ExistingRow>()
    const existingByName = new Map<string, ExistingRow>()
    for (const p of existingRows) {
      if (isUsableParticipantIdNumber(p.idNumber)) continue
      const ph = cleanParticipantPhone(p.phone)
      if (ph && !existingByPhone.has(ph)) existingByPhone.set(ph, p)
      const nm = (p.fullName || "").trim()
      if (nm && !existingByName.has(nm)) existingByName.set(nm, p)
    }

    // ------- שלב 2: פירוק שורות הגיליון ושיוכן להדרכה -------
    /** direct = שויכה לפי מזהה ההדרכה; אחרת שויכה לפי ת״ז קיימת */
    const byIdNumber = new Map<string, { row: ParsedRow; direct: boolean }>()
    const byFallbackKey = new Map<string, ParsedRow>()
    let skipped = 0
    let directRows = 0
    let matchedByIdNumber = 0

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const sheetRow = headerOffset + i + 1
      const rawRow = rawRows[i + headerOffset] || []
      const rowTrainingKey = cleanKey(row[COL.trainingId])
      const direct = Boolean(trainingKey) && rowTrainingKey === trainingKey

      const { idNumber, warning } = resolveSheetIdNumber(
        cell(row, COL.idNumber),
        rawRow[COL.idNumber],
      )
      const fullName = cell(row, COL.fullName)

      if (warning) {
        // ת״ז לא קריאה — לא ניתן לשייך לפי ת״ז, מתריעים רק על שורות ההדרכה
        if (direct) {
          warnings.push(`שורה ${sheetRow} (${fullName || "ללא שם"}): ${warning}`)
          skipped++
        }
        continue
      }

      const usableId = isUsableParticipantIdNumber(idNumber)
      const existingByIdNumber = usableId ? existingById.get(idNumber) : undefined

      // לא ההדרכה הזו ולא ת״ז מוכרת כאן — שורה של הדרכה אחרת
      if (!direct && !existingByIdNumber) continue

      const courseDateIso = toIsoDate(cell(row, COL.courseDate))

      if (!direct) {
        const dateMatches = Boolean(
          courseDateIso && leadDates.has(courseDateIso),
        )
        if (rowTrainingKey) {
          // השורה משויכת בגיליון להדרכה אחרת — נדרש תאריך זהה כדי לשייך לכאן
          if (!dateMatches) continue
        } else if (leadDates.size && courseDateIso && !dateMatches) {
          // בלי מזהה הדרכה בגיליון — נדחית רק כשהתאריך סותר את מועדי ההדרכה
          warnings.push(
            `שורה ${sheetRow} (${fullName || "ללא שם"}): ת״ז מוכרת בהדרכה אך תאריך הקורס בגיליון (${courseDateIso}) אינו ממועדי ההדרכה — לא שויכה`,
          )
          skipped++
          continue
        }
        matchedByIdNumber++
      } else {
        directRows++
      }

      const phone = cleanParticipantPhone(cell(row, COL.phone))
      if (!fullName && !idNumber && !phone) {
        skipped++
        continue
      }

      const parsed: ParsedRow = {
        sheetRow,
        fullName,
        idNumber,
        courseDate: courseDateIso || cell(row, COL.courseDate) || null,
        email: cell(row, COL.email),
        phone,
        courseType: cell(row, COL.courseType) || null,
        organizerName: cell(row, COL.organizer) || null,
        satisfaction: cell(row, COL.satisfied) || null,
        kitInterest: cell(row, COL.buyKit) || null,
        feedback: cell(row, COL.feedback) || null,
      }

      if (usableId) {
        const prev = byIdNumber.get(idNumber)
        if (!prev) {
          byIdNumber.set(idNumber, { row: parsed, direct })
        } else if (prev.direct && !direct) {
          // שורה עם מזהה ההדרכה גוברת על שיוך לפי ת״ז
        } else if (!prev.direct && direct) {
          byIdNumber.set(idNumber, { row: parsed, direct: true })
        } else {
          byIdNumber.set(idNumber, {
            row: mergeParsedRows(prev.row, parsed),
            direct,
          })
        }
        continue
      }

      // בלי ת״ז תקינה — רק שורות של ההדרכה, במפתח חלופי שלא ישכפל כל סנכרון
      const fallbackKey = phone || fullName
      if (!fallbackKey) {
        skipped++
        continue
      }
      const prevFallback = byFallbackKey.get(fallbackKey)
      byFallbackKey.set(
        fallbackKey,
        prevFallback ? mergeParsedRows(prevFallback, parsed) : parsed,
      )
    }

    if (!directRows && !matchedByIdNumber) {
      warnings.push(
        `לא נמצאו בגיליון שורות של ההדרכה — לא לפי מזהה ההדרכה ולא לפי ת״ז של המשתתפים (${dataRows.length} שורות נסרקו)`,
      )
      return {
        ok: true,
        added: 0,
        skipped: 0,
        updated: 0,
        matchedByIdNumber: 0,
        warnings,
      }
    }
    if (!byIdNumber.size && !byFallbackKey.size) {
      return {
        ok: true,
        added: 0,
        skipped,
        updated: 0,
        matchedByIdNumber: 0,
        warnings,
      }
    }

    // ------- שלב 3: בניית פעולות עדכון / יצירה -------
    const updates: { id: string; data: Prisma.ParticipantUpdateInput }[] = []
    const creates: Prisma.ParticipantUncheckedCreateInput[] = []

    const queue: { row: ParsedRow; existing: ExistingRow | undefined }[] = []
    for (const [id, entry] of byIdNumber) {
      queue.push({ row: entry.row, existing: existingById.get(id) })
    }
    for (const row of byFallbackKey.values()) {
      const existing =
        (row.phone ? existingByPhone.get(row.phone) : undefined) ||
        (row.fullName ? existingByName.get(row.fullName) : undefined)
      queue.push({ row, existing })
    }

    for (const { row, existing } of queue) {
      const merged = buildMergedParticipantData(
        toUpsertFields(row),
        existing ?? null,
        "preferIncoming",
      )
      if (existing) {
        updates.push({
          id: existing.id,
          data: merged as Prisma.ParticipantUpdateInput,
        })
        continue
      }
      if (merged.certifyingBody === undefined) {
        merged.certifyingBody = resolveParticipantCertifyingBodyOnCreate({
          isExternal: Boolean(merged.isExternal),
          leadDeliveryMethod: lead.deliveryMethod,
        })
      }
      creates.push({
        ...(merged as Prisma.ParticipantUncheckedCreateInput),
        leadId: trainingId,
      })
    }

    // ------- שלב 4: כתיבה מקובצת (סבב אחד לעדכונים, אחד ליצירות) -------
    if (updates.length) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.participant.update({ where: { id: u.id }, data: u.data }),
        ),
      )
    }
    const createdRows = creates.length
      ? await prisma.$transaction(
          creates.map((data) => prisma.participant.create({ data })),
        )
      : []

    const updated = updates.length
    const added = createdRows.length

    // ------- שלב 5: סנכרון מאגר המודרכים — מקובץ -------
    await syncTraineesForParticipants([
      ...updates.map((u) => u.id),
      ...createdRows.map((p) => p.id),
    ])

    // ------- שלב 6: הערת יומן מרוכזת במקום אחת לכל שורה -------
    if (updated > 0) {
      await prisma.activityLog.create({
        data: {
          leadId: trainingId,
          performedBy: "מערכת",
          previousStatus: "_note",
          newStatus: `פרטי ${updated} משתתפים עודכנו אוטומטית מרישום בקישור/Wix`,
        },
      })
    }

    return { ok: true, added, skipped, updated, matchedByIdNumber, warnings }
  } catch (err) {
    console.error("[refreshParticipantsFromWix]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בסנכרון מ-Wix",
    }
  }
}

/**
 * קישור/עדכון מודרכים גלובליים לקבוצת משתתפים — במספר קבוע של שאילתות
 * (מקביל ל-syncParticipantContactToTrainee, בלי לופ של קריאה-כתיבה לכל שורה).
 */
async function syncTraineesForParticipants(
  participantIds: string[],
): Promise<void> {
  const ids = [...new Set(participantIds.filter(Boolean))]
  if (!ids.length) return

  const participants = await prisma.participant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      fullName: true,
      idNumber: true,
      email: true,
      phone: true,
      traineeId: true,
    },
  })

  const relevant = participants.filter(
    (p) => p.traineeId || isUsableParticipantIdNumber(p.idNumber),
  )
  if (!relevant.length) return

  const normalizedIds = [
    ...new Set(
      relevant
        .map((p) => normalizeParticipantIdNumber(p.idNumber))
        .filter((id) => isUsableParticipantIdNumber(id)),
    ),
  ]
  const linkedIds = [
    ...new Set(relevant.map((p) => p.traineeId).filter(Boolean) as string[]),
  ]

  const trainees = await prisma.trainee.findMany({
    where: {
      OR: [
        ...(normalizedIds.length ? [{ idNumber: { in: normalizedIds } }] : []),
        ...(linkedIds.length ? [{ id: { in: linkedIds } }] : []),
      ],
    },
    select: {
      id: true,
      idNumber: true,
      fullName: true,
      email: true,
      phone: true,
    },
  })

  type TraineeRow = (typeof trainees)[number]
  const traineeById = new Map<string, TraineeRow>()
  const traineeByIdNumber = new Map<string, TraineeRow>()
  for (const t of trainees) {
    traineeById.set(t.id, t)
    const norm = normalizeParticipantIdNumber(t.idNumber)
    if (isUsableParticipantIdNumber(norm) && !traineeByIdNumber.has(norm)) {
      traineeByIdNumber.set(norm, t)
    }
  }

  const traineeUpdates: { id: string; data: Prisma.TraineeUpdateInput }[] = []
  const participantLinks: { id: string; traineeId: string }[] = []
  const pendingCreates = new Map<
    string,
    { data: Prisma.TraineeUncheckedCreateInput; participantIds: string[] }
  >()
  /** ת״ז שנתפסו במהלך הריצה (עדכון temp- / יצירה) — מונע התנגשות unique */
  const claimedIdNumbers = new Set(traineeByIdNumber.keys())

  for (const p of relevant) {
    const norm = normalizeParticipantIdNumber(p.idNumber)
    const usable = isUsableParticipantIdNumber(norm)
    const linked = p.traineeId ? traineeById.get(p.traineeId) : undefined
    const target = linked || (usable ? traineeByIdNumber.get(norm) : undefined)

    const fullName = p.fullName.trim() || "ללא שם"
    const email = p.email?.trim() || null
    const phone = p.phone?.trim() || null

    if (target) {
      const data: Prisma.TraineeUpdateInput = {}
      if (fullName && fullName !== target.fullName) data.fullName = fullName
      if (email && email !== target.email) data.email = email
      if (phone && phone !== target.phone) data.phone = phone
      // מודרך שנוצר בלי ת״ז (temp-) — משדרגים למזהה האמיתי כשהוא פנוי
      if (
        usable &&
        target.idNumber.startsWith("temp-") &&
        !claimedIdNumbers.has(norm)
      ) {
        data.idNumber = norm
        claimedIdNumbers.add(norm)
      }
      if (Object.keys(data).length) {
        traineeUpdates.push({ id: target.id, data })
      }
      if (p.traineeId !== target.id) {
        participantLinks.push({ id: p.id, traineeId: target.id })
      }
      continue
    }

    if (!usable) continue

    const pending = pendingCreates.get(norm)
    if (pending) {
      pending.participantIds.push(p.id)
      continue
    }
    pendingCreates.set(norm, {
      data: { fullName, idNumber: norm, email, phone },
      participantIds: [p.id],
    })
    claimedIdNumbers.add(norm)
  }

  if (pendingCreates.size) {
    const entries = [...pendingCreates.values()]
    const created = await prisma.$transaction(
      entries.map((e) => prisma.trainee.create({ data: e.data })),
    )
    created.forEach((trainee, index) => {
      for (const participantId of entries[index].participantIds) {
        participantLinks.push({ id: participantId, traineeId: trainee.id })
      }
    })
  }

  if (traineeUpdates.length || participantLinks.length) {
    await prisma.$transaction([
      ...traineeUpdates.map((t) =>
        prisma.trainee.update({ where: { id: t.id }, data: t.data }),
      ),
      ...participantLinks.map((l) =>
        prisma.participant.update({
          where: { id: l.id },
          data: { traineeId: l.traineeId },
        }),
      ),
    ])
  }
}
