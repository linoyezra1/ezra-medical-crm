"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { updateTrainee } from "@/lib/actions"
import { useApp } from "@/lib/store"
import { CERTIFYING_BODY_OPTIONS, type Trainee } from "@/lib/types"

type Props = {
  trainee: Trainee | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TraineeEditDialog({ trainee, open, onOpenChange }: Props) {
  const { updateTraineeLocal, refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    notes: "",
    certifyingBody: "",
  })

  useEffect(() => {
    if (!trainee || !open) return
    setForm({
      fullName: trainee.fullName,
      idNumber: trainee.idNumber,
      phone: trainee.phone || "",
      email: trainee.email || "",
      notes: trainee.notes || "",
      certifyingBody: trainee.certifyingBody || "",
    })
  }, [trainee, open])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trainee) return
    setSaving(true)
    const res = await updateTrainee(trainee.id, {
      fullName: form.fullName,
      idNumber: form.idNumber,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      certifyingBody: form.certifyingBody.trim() || null,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    updateTraineeLocal(trainee.id, {
      fullName: form.fullName.trim(),
      idNumber: form.idNumber.trim().replace(/[-\s]/g, ""),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      notes: form.notes.trim() || undefined,
      certifyingBody: form.certifyingBody.trim() || undefined,
    })
    toast.success("פרטי המודרך עודכנו")
    refresh()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">עריכת מודרך</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="שם מלא (אופציונלי)">
            <Input
              value={form.fullName}
              onChange={(e) =>
                setForm((f) => ({ ...f, fullName: e.target.value }))
              }
            />
          </Field>
          <Field label='ת"ז (אופציונלי)'>
            <Input
              value={form.idNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, idNumber: e.target.value }))
              }
              inputMode="numeric"
              dir="ltr"
              className="text-right"
            />
          </Field>
          <Field label="טלפון">
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              type="tel"
              dir="ltr"
              className="text-right"
            />
          </Field>
          <Field label="אימייל">
            <Input
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              type="email"
              dir="ltr"
              className="text-right"
            />
          </Field>
          <Field label="תעודות דרך מי">
            <Select
              value={form.certifyingBody || "__empty__"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  certifyingBody: !v || v === "__empty__" ? "" : v,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחירה…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">ללא</SelectItem>
                {CERTIFYING_BODY_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="הערות">
            <Textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={3}
            />
          </Field>

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "שומר…" : "אישור"}
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
