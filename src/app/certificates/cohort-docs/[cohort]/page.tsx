import { CohortDocumentationDetailView } from "@/components/certificates-hub/cohort-documentation-detail-view"
import { decodeCohortParam } from "@/lib/cohort-documentation"

export const dynamic = "force-dynamic"

export default async function CohortDocumentationDetailPage({
  params,
}: {
  params: Promise<{ cohort: string }>
}) {
  const { cohort } = await params
  return <CohortDocumentationDetailView cohortName={decodeCohortParam(cohort)} />
}
