import { NextResponse } from "next/server"
import { listEligibleCertificateParticipantsAction } from "@/lib/certificates-hub-actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/certificates/eligible — מודרכים עם עבודת תעודות פתוחה */
export async function GET() {
  const res = await listEligibleCertificateParticipantsAction()
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, data: res.data })
}
