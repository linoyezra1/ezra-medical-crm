"use client"

import { PageHeader } from "@/components/app-shell"
import { TraineesPanel } from "@/components/clients/trainees-panel"
import { useApp } from "@/lib/store"

export function ClientsView() {
  const { trainees } = useApp()

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <PageHeader
        title="ניהול מודרכים"
        subtitle={`${trainees.length} מודרכים במערכת`}
      />
      <div className="w-full max-w-full overflow-x-hidden p-4 md:p-5">
        <TraineesPanel />
      </div>
    </div>
  )
}
