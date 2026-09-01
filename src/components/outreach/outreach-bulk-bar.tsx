"use client"

import { useState } from "react"
import { Archive, CheckCircle2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { bulkUpdateOutreachLeadRelevanceAction } from "@/lib/outreach-actions"

export function OutreachBulkBar({
  selectedLeadIds,
  onClear,
  onDone,
}: {
  selectedLeadIds: string[]
  onClear: () => void
  onDone: () => void
}) {
  const count = selectedLeadIds.length
  const [busy, setBusy] = useState(false)

  if (count === 0) return null

  const apply = async (relevant: boolean) => {
    setBusy(true)
    const res = await bulkUpdateOutreachLeadRelevanceAction({
      leadIds: selectedLeadIds,
      relevant,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("סטטוס הלידים עודכן בהצלחה")
    onDone()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-3 py-3 shadow-lg backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 pb-[env(safe-area-inset-bottom)]">
        <p className="text-sm font-semibold">נבחרו {count} לידים</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl border-amber-300 text-amber-900 hover:bg-amber-50"
            disabled={busy}
            onClick={() => void apply(false)}
          >
            <Archive className="size-3.5" />
            {busy ? "מעדכן…" : "סמן כלא רלוונטי"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl border-emerald-300 text-emerald-900 hover:bg-emerald-50"
            disabled={busy}
            onClick={() => void apply(true)}
          >
            <CheckCircle2 className="size-3.5" />
            {busy ? "מעדכן…" : "סמן כרלוונטי"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-xl"
            disabled={busy}
            onClick={onClear}
          >
            בטל בחירה
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={busy}
            onClick={onClear}
            aria-label="בטל בחירה"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
