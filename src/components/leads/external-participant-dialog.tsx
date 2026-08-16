"use client"

import { useMemo, useState } from "react"
import { ContactRound } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addExternalParticipant } from "@/lib/actions"
import { collectCourseTypeOptions } from "@/lib/course-type"
import { formatLeadCourseType } from "@/lib/course-type"
import { useApp } from "@/lib/store"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExternalParticipantDialog({ open, onOpenChange }: Props) {
  const { leads, settings, refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    courseType: "",
    agreedPrice: "",
    idNumber: "",
    email: "",
    leadId: "",
  })

  const assignable = useMemo(
    () =>
      leads
        .filter((l) => l.status === "new" || l.status === "closed")
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [leads],
  )

  const courseOptions = useMemo(
    () => collectCourseTypeOptions(leads, settings.courses),
    [settings.courses, leads],
  )

  const reset = () =>
    setForm({
      fullName: "",
      phone: "",
      courseType: "",
      agreedPrice: "",
      idNumber: "",
      email: "",
      leadId: "",
    })

  const importContact = async () => {
    const contacts = (
      navigator as Navigator & {
        contacts?: {
          select: (
            props: string[],
            opts: { multiple: boolean },
          ) => Promise<Array<{ name?: string[]; tel?: string[] }>>
        }
      }
    ).contacts
    if (!contacts?.select) {
      toast.error("ייבוא אנשי קשר לא נתמך במכשיר זה")
      return
    }
    try {
      const selected = await contacts.select(["name", "tel"], {
        multiple: false,
      })
      const c = selected[0]
      if (!c) return
      setForm((f) => ({
        ...f,
        fullName: c.name?.[0] || f.fullName,
        phone: c.tel?.[0]?.replace(/\D/g, "") || f.phone,
      }))
    } catch {
      /* user cancelled */
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.leadId) {
      toast.error("יש לבחור הדרכה")
      return
    }
    setSaving(true)
    const res = await addExternalParticipant({
      leadId: form.leadId,
      fullName: form.fullName,
      phone: form.phone,
      courseType: form.courseType,
      agreedPrice: form.agreedPrice ? Number(form.agreedPrice) : undefined,
      idNumber: form.idNumber,
      email: form.email,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("מצטרף נוסף נרשם")
    reset()
    refresh()
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">מצטרף נוסף</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-sm">שם מלא</Label>
            <Input
              value={form.fullName}
              onChange={(e) =>
                setForm((f) => ({ ...f, fullName: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">טלפון</Label>
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              inputMode="tel"
              dir="ltr"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={importContact}
          >
            <ContactRound className="size-4" />
            ייבוא מאנשי קשר
          </Button>
          <div>
            <Label className="mb-1.5 block text-sm">סוג קורס לתעודה</Label>
            <Select
              value={form.courseType || undefined}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, courseType: v ?? "" }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחר סוג קורס" />
              </SelectTrigger>
              <SelectContent>
                {courseOptions.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">מחיר לתשלום</Label>
            <Input
              type="number"
              min={0}
              value={form.agreedPrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, agreedPrice: e.target.value }))
              }
              dir="ltr"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">תעודת זהות</Label>
            <Input
              value={form.idNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, idNumber: e.target.value }))
              }
              dir="ltr"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">אימייל</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              dir="ltr"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">שיוך להדרכה</Label>
            <Select
              value={form.leadId || undefined}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, leadId: v ?? "" }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחר הדרכה" />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {formatLeadCourseType(l, settings.courses)} ·{" "}
                    {l.date || "ללא תאריך"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
