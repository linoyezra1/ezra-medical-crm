import { LeadsWorkspace } from "@/components/leads/leads-workspace"

export const dynamic = "force-dynamic"

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <LeadsWorkspace selectedId={id} />
}
