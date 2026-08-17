"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { quickAddInstructor } from "@/lib/instructor-actions"
import type { InstructorProfile } from "@/lib/types"

export function QuickAddInstructorModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (instructor: InstructorProfile) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [commission, setCommission] = useState("0")
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setName("")
    setPhone("")
    setCommission("0")
  }

  const submit = async () => {
    setBusy(true)
    const res = await quickAddInstructor({
      name,
      phone,
      salesCommissionPercentage: Number(commission) || 0,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`המדריך ${res.data.name} נוסף ושובץ`)
    onCreated(res.data)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">הוספת מדריך חדש</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="שם מלא" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם המדריך"
            />
          </Field>
          <Field label="טלפון" required>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              dir="ltr"
              inputMode="tel"
            />
          </Field>
          <Field label="אחוז עמלת מכירות (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              dir="ltr"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            שם משתמש וסיסמה לאזור האישי יוגדרו אוטומטית לפי מספר הטלפון.
          </p>

          <Button
            type="button"
            className="h-11 w-full rounded-xl font-bold"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                שומר…
              </>
            ) : (
              "שמור ושבץ מדריך"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  )
}
