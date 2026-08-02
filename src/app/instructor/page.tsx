import { InstructorUnauthorized } from "@/components/instructor/instructor-unauthorized"

export const dynamic = "force-dynamic"

/** אין כניסה לממשק מדריך ללא טוקן ב־URL */
export default function InstructorIndexPage() {
  return <InstructorUnauthorized />
}
