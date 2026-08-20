import { InstructorUnauthorized } from "@/components/instructor/instructor-unauthorized"
import { InstructorAuthTrainingParticipantsView } from "@/components/instructor/instructor-auth-training-participants-view"
import { prisma } from "@/lib/db"
import { requireAuthenticatedInstructor } from "@/lib/instructor-auth-server"

export const dynamic = "force-dynamic"

export default async function InstructorTrainingByIdPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const auth = await requireAuthenticatedInstructor().catch(() => null)
  if (!auth) return <InstructorUnauthorized />

  const { leadId } = await params

  const allowed = await prisma.lead.findFirst({
    where: { id: leadId, instructorId: auth.id },
    select: { id: true },
  })

  if (!allowed) return <InstructorUnauthorized />

  return <InstructorAuthTrainingParticipantsView leadId={leadId} />
}

