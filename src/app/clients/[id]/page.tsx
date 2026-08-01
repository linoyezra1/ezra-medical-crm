import { ClientDetailView } from "@/components/clients/client-detail-view";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientDetailView id={id} />;
}
