"use client"

import { useState } from "react"
import { toast } from "sonner"
import { TrainingSelect } from "@/components/clients/training-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { assignTraineesToLead } from "@/lib/actions"
import { useApp } from "@/lib/store"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  traineeIds: string[]
  onAssigned?: () => void
}

export function TraineeAssignDialog({
  open,
  onOpenChange,
  traineeIds,
  onAssigned,
}: Props) {
  const { refresh } = useApp()
  const [leadId, setLeadId] = useState("")
  const [saving, setSaving] = useState(false)

  const onConfirm = async () => {
    if (!leadId) {
      toast.error("יש לבחור הדרכה")
      return
    }
    setSaving(true)
    const res = await assignTraineesToLead(traineeIds, leadId)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `שויכו ${res.data.linked} מודרכים` +
        (res.data.skipped ? ` · ${res.data.skipped} כבר היו משויכים` : ""),
    )
    refresh()
    onAssigned?.()
    setLeadId("")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setLeadId("")
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">שיוך להדרכה</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {traineeIds.length} מודרכים נבחרו · מוצגות הדרכות בסטטוס ״סגרנו
            נרשם ביומן״ או ״ממתין לתעודות״
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block text-sm font-medium">בחירת הדרכה</label>
          <TrainingSelect value={leadId} onChange={setLeadId} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            disabled={saving || !leadId || !traineeIds.length}
            onClick={() => void onConfirm()}
          >
            {saving ? "משייך…" : "אישור שיוך"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
