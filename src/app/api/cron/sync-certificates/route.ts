import { NextResponse } from "next/server"
import { syncCertificateFlagsFromSheets } from "@/lib/google-sheets/certificates"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return true
  const header = req.headers.get("authorization") || ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : ""
  const query = new URL(req.url).searchParams.get("secret") || ""
  return bearer === secret || query === secret
}

/** סנכרון תקופתי מ-Google Sheets (cron / ידני) */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const res = await syncCertificateFlagsFromSheets()
  if (!res.ok) {
    return NextResponse.json(res, { status: 500 })
  }
  return NextResponse.json(res)
}

export async function POST(req: Request) {
  return GET(req)
}
