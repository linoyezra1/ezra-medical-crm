import { prisma } from "@/lib/db"
import { COURSE_CATEGORIES } from "@/lib/constants"
import { formatCourseTypeLabel } from "@/lib/course-type"
import {
  PAYMENT_METHODS,
  TRAINING_SALE_PENDING_PAYMENT,
} from "@/lib/payment"
import { formatInJerusalem } from "@/lib/timezone"

export type SalesBackupRow = {
  clientName: string
  clientPhone: string
  clientEmail: string
  saleDate: string
  courseDetails: string
  productName: string
  quantity: number
  unitPrice: number
  totalAmount: number
  paymentMethod: string
  paymentStatus: string
  participantName: string
  saleId: string
}

function categoryLabel(
  courseCategory?: string | null,
  courseCategoryOther?: string | null,
): string {
  const other = courseCategoryOther?.trim()
  if (other) return other
  const raw = courseCategory?.trim() || ""
  if (!raw) return ""
  return COURSE_CATEGORIES.find((c) => c.value === raw)?.label || raw
}

function paymentMethodLabel(value?: string | null): string {
  if (!value?.trim()) return ""
  return (
    PAYMENT_METHODS.find((m) => m.value === value)?.label || value.trim()
  )
}

function paymentStatusLabel(status?: string | null): string {
  if (status === TRAINING_SALE_PENDING_PAYMENT) return "ממתין לתשלום"
  return "שולם"
}

/** תאריך מכירה בפורמט DD/MM/YYYY (שעון ישראל) */
function saleDateLabel(createdAt: Date): string {
  const { date } = formatInJerusalem(createdAt)
  if (!date) return ""
  const [y, m, d] = date.split("-")
  if (!y || !m || !d) return ""
  return `${d}/${m}/${y}`
}

function courseDetailsLabel(lead: {
  courseType: string | null
  courseTypeOther: string | null
  courseCategory: string | null
  courseCategoryOther: string | null
  city: string | null
  location: string | null
} | null): string {
  if (!lead) return "מכירה עצמאית"
  const course = formatCourseTypeLabel(lead.courseType, {
    other: lead.courseTypeOther,
  })
  const category = categoryLabel(lead.courseCategory, lead.courseCategoryOther)
  const city = (lead.city || lead.location || "").trim()
  return [course, category, city].filter(Boolean).join(" - ")
}

export function getSalesAppsScriptUrl(): string | null {
  return process.env.SALES_GOOGLE_APPS_SCRIPT_URL?.trim() || null
}

/** בונה מערך מכירות לגיבוי Google Sheets */
export async function buildSalesBackupPayload(): Promise<SalesBackupRow[]> {
  const sales = await prisma.trainingSale.findMany({
    include: {
      inventoryItem: { select: { name: true } },
      participant: { select: { fullName: true } },
      lead: {
        select: {
          fullName: true,
          phone: true,
          email: true,
          courseType: true,
          courseTypeOther: true,
          courseCategory: true,
          courseCategoryOther: true,
          city: true,
          location: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  return sales.map((sale) => {
    const unitPrice = Number(sale.unitSellingPrice) || 0
    const quantity = Number(sale.quantity) || 0
    return {
      clientName: sale.lead?.fullName?.trim() || "",
      clientPhone: sale.lead?.phone?.trim() || "",
      clientEmail: sale.lead?.email?.trim() || "",
      saleDate: saleDateLabel(sale.createdAt),
      courseDetails: courseDetailsLabel(sale.lead),
      productName: sale.inventoryItem?.name?.trim() || "פריט",
      quantity,
      unitPrice,
      totalAmount: unitPrice * quantity,
      paymentMethod: paymentMethodLabel(sale.paymentMethod),
      paymentStatus: paymentStatusLabel(sale.paymentStatus),
      participantName: sale.participant?.fullName?.trim() || "",
      saleId: sale.id,
    }
  })
}

export async function postSalesBackupToSheets(
  sales: SalesBackupRow[],
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const webhookUrl = getSalesAppsScriptUrl()
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "חסר SALES_GOOGLE_APPS_SCRIPT_URL — הגדירו את כתובת ה-Web App של גיבוי המכירות",
    }
  }

  try {
    const pin =
      process.env.CERTIFICATE_ISSUANCE_PIN?.trim() ||
      process.env.SALES_BACKUP_PIN?.trim() ||
      "214215444"

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, sales }),
      redirect: "follow",
    })
    const text = await res.text()
    let scriptMessage = ""
    try {
      const json = JSON.parse(text) as {
        ok?: boolean
        success?: boolean
        message?: string
        error?: string
      }
      if (json.error) {
        return { ok: false, error: json.error }
      }
      scriptMessage = json.message || ""
      if (json.ok === false || json.success === false) {
        return {
          ok: false,
          error: scriptMessage || "הסקריפט ב-Sheets החזיר כישלון",
        }
      }
    } catch {
      if (!res.ok) {
        return {
          ok: false,
          error: text || `שגיאת Webhook (${res.status})`,
        }
      }
      scriptMessage = text.trim()
    }

    return {
      ok: true,
      message:
        scriptMessage ||
        `גיבוי המכירות הושלם בהצלחה! (${sales.length} רשומות)`,
    }
  } catch (err) {
    console.error("[postSalesBackupToSheets]", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שגיאה בשליחה ל-Google Sheets",
    }
  }
}
