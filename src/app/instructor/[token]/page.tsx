import { InstructorUnauthorized } from "@/components/instructor/instructor-unauthorized"
import { InstructorTrainingsView } from "@/components/instructor/instructor-portal"
import { isValidInstructorPortalToken } from "@/lib/instructor-portal"

export const dynamic = "force-dynamic"

export default async function InstructorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!isValidInstructorPortalToken(token)) {
    return <InstructorUnauthorized />
  }
  return <InstructorTrainingsView portalToken={token} />
}
