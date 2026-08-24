"use client"

import { useState } from "react"
import { ClipboardPaste } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  parseParticipantsFromFreeText,
  type TraineeImportRow,
} from "@/lib/trainee-import"

const PLACEHOLDER = `הדבק כאן רשימת משתתפים (שם, מספר זהות וטלפון בכל שורה), לדוגמה:
מרים אברהמי 205413974 055-881-7221
פריידי קפלן 772311544(מספר ביטוח לאומי) +972 55-881-7221
עיטי בוקשפן 209180272`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** שיוך קבוע להדרכה הנוכחית */
  leadId?: string
  /** אחרי פרסור מוצלח — מעבירים לתצוגה מקדימה */
  onParsed: (rows: TraineeImportRow[]) => void
}

export function TextImportModal({
  open,
  onOpenChange,
  leadId,
  onParsed,
}: Props) {
  const [text, setText] = useState("")

  const reset = () => setText("")

  const onContinue = () => {
    const rows = parseParticipantsFromFreeText(text, { leadId })
    if (!rows.length) {
      toast.error(
        "לא נמצאו שורות תקינות — יש להזין שם ומספר זהות (7–9 ספרות) בכל שורה",
      )
      return
    }
    toast.success(`זוהו ${rows.length} משתתפים — בדקו בתצוגה המקדימה`)
    onParsed(rows)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-3 pe-12 text-right">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="size-4 text-primary" />
            ייבוא משתתפים מטקסט חופשי
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            הדביקו רשימה — המערכת תזהה שם, מספר זהות וטלפון מכל שורה
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            className="min-h-[240px] resize-y text-sm leading-relaxed"
            dir="rtl"
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            disabled={!text.trim()}
            onClick={onContinue}
          >
            המשך לתצוגה מקדימה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
