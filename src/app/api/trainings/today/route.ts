import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/trainings/today
 * Public endpoint for Wix registration form dropdown.
 * Returns active trainings scheduled for the current date.
 */
export async function GET() {
  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

    const leads = await prisma.lead.findMany({
      where: {
        activityType: "course",
        courseStatus: { in: ["closed", "certificates_pending"] },
        scheduledStart: { gte: startOfDay, lt: endOfDay },
      },
      include: {
        trainingSessions: {
          where: { isZoom: true },
          take: 1,
          select: { id: true },
        },
      },
      orderBy: { scheduledStart: "asc" },
    })

    const trainings = leads.map((l) => ({
      trainingId: l.id,
      contactName: l.fullName,
      city: l.city || "",
      isZoom: l.trainingSessions.length > 0,
    }))

    return NextResponse.json({ trainings }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error("[GET /api/trainings/today]", err)
    return NextResponse.json(
      { error: "שגיאה בשליפת הדרכות" },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
