import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** נתיב ישן — מפנה לדף שדורש טוקן */
export default function LegacyInstructorPayPage() {
  redirect("/instructor")
}
