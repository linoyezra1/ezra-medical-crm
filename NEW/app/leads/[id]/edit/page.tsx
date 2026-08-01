import { AppShell } from "@/components/app-shell"
import { LeadEditLoader } from "@/components/leads/lead-edit-loader"

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <AppShell>
      <LeadEditLoader leadId={id} />
    </AppShell>
  )
}
