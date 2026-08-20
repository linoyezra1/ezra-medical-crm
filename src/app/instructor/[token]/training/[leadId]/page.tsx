import { InstructorTrainingParticipantsView } from "@/components/instructor/instructor-training-participants-view"
import { InstructorUnauthorized } from "@/components/instructor/instructor-unauthorized"
import { isValidInstructorPortalToken } from "@/lib/instructor-portal"

export const dynamic = "force-dynamic"

export default async function InstructorTrainingParticipantsPage({
  params,
}: {
  params: Promise<{ token: string; leadId: string }>
}) {
  const { token, leadId } = await params
  if (!isValidInstructorPortalToken(token)) {
    return <InstructorUnauthorized />
  }
  return <InstructorTrainingParticipantsView token={token} leadId={leadId} />
}

