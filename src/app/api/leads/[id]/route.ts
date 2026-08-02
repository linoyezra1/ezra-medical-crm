import { NextResponse } from "next/server"
import { updateLead } from "@/lib/actions"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/leads/[id]
 * שומר שינויי ליד (כולל מחיר / agreedPrice) ל־PostgreSQL דרך Prisma.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, error: "מזהה ליד חסר" },
        { status: 400 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { ok: false, error: "גוף הבקשה אינו JSON תקין" },
        { status: 400 },
      )
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "חסרים נתונים לעדכון" },
        { status: 400 },
      )
    }

    const bypassConflict = Boolean(body.bypassConflict)
    const { bypassConflict: _b, ...raw } = body

    const res = await updateLead(id, raw, { bypassConflict })
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: res.error,
          code: res.code,
          conflicts: res.conflicts,
        },
        { status: res.code === "conflict" ? 409 : 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      data: res.data,
      agreedPrice: raw.agreedPrice ?? null,
    })
  } catch (err) {
    console.error("[PATCH /api/leads/[id]]", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "שגיאה בשמירת הליד במסד הנתונים",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request, context: RouteContext) {
  return PATCH(request, context)
}
