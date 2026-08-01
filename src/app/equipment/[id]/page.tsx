import { EquipmentDetailView } from "@/components/equipment/equipment-detail-view";

export const dynamic = "force-dynamic";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EquipmentDetailView id={id} />;
}
