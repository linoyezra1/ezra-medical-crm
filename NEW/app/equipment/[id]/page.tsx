import { AppShell } from "@/components/app-shell"
import { EquipmentDetailView } from "@/components/equipment/equipment-detail-view"

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <AppShell>
      <EquipmentDetailView id={id} />
    </AppShell>
  )
}
