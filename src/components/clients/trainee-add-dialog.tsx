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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createTraineeManual } from "@/lib/actions"
import { useApp } from "@/lib/store"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TraineeAddDialog({ open, onOpenChange }: Props) {
  const { refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    leadId: "",
    notes: "",
  })

  const reset = () => {
    setForm({
      fullName: "",
      idNumber: "",
      phone: "",
      email: "",
      leadId: "",
      notes: "",
    })
    setSaving(false)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !form.fullName.trim() &&
      !form.idNumber.trim() &&
      !form.phone.trim() &&
      !form.email.trim()
    ) {
      toast.error("יש למלא לפחות שדה אחד")
      return
    }
    setSaving(true)
    const res = await createTraineeManual({
      fullName: form.fullName,
      idNumber: form.idNumber,
      phone: form.phone || undefined,
      email: form.email || undefined,
      notes: form.notes || undefined,
      leadId: form.leadId || undefined,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      res.data.participantId
        ? "המודרך נוסף ושויך להדרכה"
        : "המודרך נוסף בהצלחה",
    )
    refresh()
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">הוספת מודרך ידנית</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            כל השדות אופציונליים — מספיק למלא שדה אחד
          </p>
          <Field label="שם מלא (אופציונלי)">
            <Input
              value={form.fullName}
              onChange={(e) =>
                setForm((f) => ({ ...f, fullName: e.target.value }))
              }
              placeholder="שם מלא"
            />
          </Field>
          <Field label='ת"ז (אופציונלי)'>
            <Input
              value={form.idNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, idNumber: e.target.value }))
              }
              placeholder="000000000"
              inputMode="numeric"
              dir="ltr"
              className="text-right"
            />
          </Field>
          <Field label="טלפון (אופציונלי)">
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              placeholder="050-0000000"
              type="tel"
              dir="ltr"
              className="text-right"
            />
          </Field>
          <Field label="אימייל (אופציונלי)">
            <Input
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="name@example.com"
              type="email"
              dir="ltr"
              className="text-right"
            />
          </Field>
          <Field label="שיוך להדרכה (אופציונלי)">
            <TrainingSelect
              value={form.leadId}
              onChange={(leadId) => setForm((f) => ({ ...f, leadId }))}
              optional
            />
          </Field>
          <Field label="הערות (אופציונלי)">
            <Textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="הערות"
              rows={2}
            />
          </Field>

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "שומר…" : "הוספת מודרך"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
