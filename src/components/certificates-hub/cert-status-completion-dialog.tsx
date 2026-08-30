"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** שאלה בעת יצירת סטטוס חדש שלא קיים במאגר */
export function CertStatusCompletionDialog({
  open,
  label,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  label: string
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (isCompleted: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right leading-snug">
            האם הסטטוס &laquo;{label}&raquo; מסמן שהתעודה הושלמה/הסתיימה?
          </DialogTitle>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:justify-start">
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => onConfirm(true)}
          >
            {busy ? "שומר…" : "כן, סמן כהושלם"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => onConfirm(false)}
          >
            לא, סטטוס בתהליך
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
