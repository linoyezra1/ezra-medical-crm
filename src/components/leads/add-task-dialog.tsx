"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { uid } from "@/lib/helpers"
import type { Task } from "@/lib/types"

interface Props {
  leadId?: string
  leadName?: string
  onAdd: (task: Task) => void
  triggerClassName?: string
}

export function AddTaskDialog({
  leadId,
  leadName,
  onAdd,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")

  const submit = () => {
    if (!title.trim()) {
      toast.error("יש להזין תיאור משימה")
      return
    }
    onAdd({
      id: uid("task"),
      title: title.trim(),
      date: date.trim(),
      time: date.trim() && time.trim() ? time.trim() : undefined,
      assignee: "מכירות",
      note: leadName ? `משימה עבור ${leadName}` : undefined,
      done: false,
      relatedLeadId: leadId,
      type: "general",
    })
    toast.success(
      date.trim()
        ? "המשימה נוספה ליומן"
        : "המשימה נשמרה כמשימה פתוחה (ללא תאריך)",
    )
    setOpen(false)
    setTitle("")
    setDate("")
    setTime("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="secondary"
            className={triggerClassName ?? "col-span-2 rounded-2xl py-6"}
          >
            <Plus className="size-4" />
            הוסף משימה
          </Button>
        }
      />
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>הוסף משימה</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>תיאור המשימה *</Label>
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              placeholder="למשל: לחזור ללקוח לגבי אישור תאריך"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך (אופציונלי)</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>שעה (אופציונלי)</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                dir="ltr"
                disabled={!date}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            אם לא נבחר תאריך — המשימה תישמר כמשימה פתוחה בלי תזכורת ביומן.
          </p>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={submit}>
            שמור משימה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
