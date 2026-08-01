import { LeadEditLoader } from "@/components/leads/lead-edit-loader";

export const dynamic = "force-dynamic";

export default async function LeadEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadEditLoader leadId={id} />;
}
