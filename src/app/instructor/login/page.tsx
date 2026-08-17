import { Suspense } from "react"
import { InstructorLoginForm } from "@/components/instructor/instructor-login-form"

export const dynamic = "force-dynamic"

export default function InstructorLoginPage() {
  return (
    <Suspense fallback={null}>
      <InstructorLoginForm />
    </Suspense>
  )
}
