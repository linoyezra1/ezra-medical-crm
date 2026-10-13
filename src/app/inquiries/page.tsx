import { InquiriesView } from "@/components/inquiries/inquiries-view"
import { listCourseInquiries } from "@/lib/actions"

export const metadata = { title: "מתעניינים" }
export const dynamic = "force-dynamic"

export default async function InquiriesPage() {
  const rows = await listCourseInquiries()
  return <InquiriesView initialRows={rows} />
}
