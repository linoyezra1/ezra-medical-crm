import { InquiriesView } from "@/components/inquiries/inquiries-view"
import { listCourseInquiries } from "@/lib/actions"

export const metadata = { title: "מתעניינים" }
export const dynamic = "force-dynamic"

export default async function InquiriesPage() {
  try {
    const rows = await listCourseInquiries()
    return <InquiriesView initialRows={rows} />
  } catch (err) {
    console.error("[InquiriesPage]", err)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        רשימת המתעניינים עדיין לא זמינה. צריך לעדכן את בסיס הנתונים ואז לרענן
        את העמוד.
      </div>
    )
  }
}
