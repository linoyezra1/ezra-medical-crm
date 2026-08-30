"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const COMPLETED_LABEL =
  "סטטוס זה מציין סיום והשלמת התעודה (הופק/נמסר)"

/** מאפס טיוטה בכל פתיחה מחדש */
function useStateLocal<T>(initial: T, open: boolean) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    if (open) setValue(initial)
  }, [open, initial])
  return [value, setValue] as const
}

export function CertStatusEditDialog({
  open,
  label,
  isCompleted,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean
  label: string
  isCompleted: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSave: (next: { label: string; isCompleted: boolean }) => void
}) {
  const [draft, setDraft] = useStateLocal(label, open)
  const [completed, setCompleted] = useStateLocal(isCompleted, open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">עריכת סטטוס</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-sm">שם הסטטוס</Label>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="text-sm"
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-right text-sm leading-snug">
            <Checkbox
              checked={completed}
              onCheckedChange={(v) => setCompleted(Boolean(v))}
              className="mt-0.5"
            />
            <span>{COMPLETED_LABEL}</span>
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() =>
              onSave({ label: draft.trim(), isCompleted: completed })
            }
          >
            {busy ? "שומר…" : "שמירה"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
