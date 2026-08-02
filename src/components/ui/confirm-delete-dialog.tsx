"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description: string
  /** אזהרה נוספת (למשל פריט עם היסטוריית מכירות) */
  warning?: string | null
  confirmLabel?: string
  cancelLabel?: string
  confirming?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title = "אישור מחיקה",
  description,
  warning,
  confirmLabel = "כן, מחק פריט",
  cancelLabel = "ביטול",
  confirming = false,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] gap-4 rounded-2xl p-5 sm:max-w-md"
        showCloseButton={!confirming}
      >
        <DialogHeader className="text-right">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {warning ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm font-medium text-destructive">
            {warning}
          </div>
        ) : null}

        <DialogFooter className="mx-0 mb-0 flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl order-2 sm:order-1"
            disabled={confirming}
            autoFocus
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11 flex-1 rounded-xl order-1 sm:order-2"
            disabled={confirming}
            onClick={() => void onConfirm()}
          >
            {confirming ? "מוחק…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
