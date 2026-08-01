"use client"

import { useApp } from "@/lib/store"
import { LeadForm } from "@/components/leads/lead-form"
import { PageHeader } from "@/components/app-shell"

export function LeadEditLoader({ leadId }: { leadId: string }) {
  const { getLead } = useApp()
  const lead = getLead(leadId)

  if (!lead) {
    return (
      <div>
        <PageHeader title="ליד לא נמצא" />
        <p className="p-8 text-center text-sm text-muted-foreground">
          הליד המבוקש אינו קיים במערכת.
        </p>
      </div>
    )
  }

  return <LeadForm existing={lead} />
}
