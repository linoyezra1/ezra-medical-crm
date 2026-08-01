import { AppShell } from "@/components/app-shell"
import { ClientDetailView } from "@/components/clients/client-detail-view"

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <AppShell>
      <ClientDetailView id={id} />
    </AppShell>
  )
}
