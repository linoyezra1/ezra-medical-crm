"use client"

import { useEffect, useMemo, useState } from "react"
import { Contact } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { addExternalParticipant, ensureCustomCourseTypeOption } from "@/lib/actions"
import {
  COURSE_TYPE_FORMAT_ERROR,
  COURSE_TYPE_OTHER,
  collectCourseTypeOptions,
  formatLeadCourseType,
  isAllowedCourseTypeValue,
} from "@/lib/course-type"
import { collectLeadCategoryOptions } from "@/lib/helpers"
import { useApp } from "@/lib/store"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** הדרכה מראש — מסך פרטי ליד */
  defaultLeadId?: string
  /** הסתר בחירת הדרכה כשכבר ידועה */
  lockLead?: boolean
  title?: string
  /** ברירת מחדל לסימון «משתתף חיצוני» */
  defaultIsExternal?: boolean
}

const EMPTY_FORM = {
  fullName: "",
  idNumber: "",
  email: "",
  phone: "",
  leadId: "",
  isExternal: true,
  isLead: false,
  courseType: "",
  courseTypeOther: "",
  courseCategory: "",
  courseCategoryOther: "",
  agreedPrice: "",
}

const CATEGORY_OTHER = "אחר"

type ContactInfo = { name?: string[]; tel?: string[] }

function contactsApiSupported() {
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & {
    contacts?: { select: unknown }
  }
  return typeof nav.contacts?.select === "function"
}

export function ExternalParticipantDialog({
  open,
  onOpenChange,
  defaultLeadId,
  lockLead = false,
  title = "מצטרף נוסף",
  defaultIsExternal = true,
}: Props) {
  const { leads, settings, refresh } = useApp()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [canPickContact, setCanPickContact] = useState(false)

  useEffect(() => {
    setCanPickContact(contactsApiSupported())
  }, [])

  useEffect(() => {
    if (!open) return
    setForm({
      ...EMPTY_FORM,
      leadId: defaultLeadId || "",
      isExternal: defaultIsExternal,
    })
  }, [open, defaultLeadId, defaultIsExternal])

  const assignable = useMemo(
    () =>
      leads
        .filter(
          (l) =>
            l.status === "new" ||
            l.status === "closed" ||
            l.status === "pending_certificates",
        )
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [leads],
  )

  const courseOptions = useMemo(
    () => collectCourseTypeOptions(leads, settings.courses),
    [settings.courses, leads],
  )

  const categoryOptions = useMemo(
    () => collectLeadCategoryOptions(leads),
    [leads],
  )

  const reset = () =>
    setForm({
      ...EMPTY_FORM,
      leadId: defaultLeadId || "",
      isExternal: defaultIsExternal,
    })

  const importFromContacts = async () => {
    try {
      const nav = navigator as Navigator & {
        contacts?: {
          select: (
            props: string[],
            opts?: { multiple?: boolean },
          ) => Promise<ContactInfo[]>
        }
      }
      if (!nav.contacts?.select) return
      const picked = await nav.contacts.select(["name", "tel"], {
        multiple: false,
      })
      const contact = picked?.[0]
      if (!contact) return
      const name = (contact.name || []).find((n) => n?.trim())?.trim() || ""
      const tel = (contact.tel || []).find((t) => t?.trim())?.trim() || ""
      setForm((f) => ({
        ...f,
        fullName: name || f.fullName,
        phone: tel || f.phone,
      }))
      if (name || tel) toast.success("אנשי הקשר יובאו")
    } catch {
      // משתמש ביטל / דפדפן חוסם
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.leadId) {
      toast.error("יש לבחור הדרכה")
      return
    }
    setSaving(true)
    let res: { ok: boolean; error?: string }
    if (form.isExternal) {
      let courseType = form.courseType
      if (courseType === COURSE_TYPE_OTHER) {
        courseType = form.courseTypeOther.trim()
        if (!courseType) {
          setSaving(false)
          toast.error("יש למלא סוג קורס")
          return
        }
        if (!isAllowedCourseTypeValue(courseType)) {
          setSaving(false)
          toast.error(COURSE_TYPE_FORMAT_ERROR)
          return
        }
        await ensureCustomCourseTypeOption(courseType)
      }
      let courseCategory = form.courseCategory
      if (courseCategory === CATEGORY_OTHER) {
        courseCategory = form.courseCategoryOther.trim()
        if (!courseCategory) {
          setSaving(false)
          toast.error("יש למלא קטגוריה")
          return
        }
      }
      res = await addExternalParticipant({
        leadId: form.leadId,
        fullName: form.fullName,
        phone: form.phone,
        courseType,
        courseCategory,
        agreedPrice:
          form.agreedPrice ? Number(form.agreedPrice) : undefined,
        idNumber: form.idNumber,
        email: form.email,
        isExternal: true,
        isLead: form.isLead,
      })
    } else {
      res = await addExternalParticipant({
        leadId: form.leadId,
        fullName: form.fullName,
        phone: form.phone,
        idNumber: form.idNumber,
        email: form.email,
        isExternal: false,
        isLead: form.isLead,
        agreedPrice: form.isLead && form.agreedPrice
          ? Number(form.agreedPrice)
          : undefined,
      })
    }
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(form.isExternal ? "מצטרף חיצוני נרשם" : "משתתף נוסף בהצלחה")
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
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pe-12 text-right">
          <DialogTitle className="text-right">{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            <div>
              <Label className="mb-1.5 block text-sm">שם מלא</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  className="min-w-0 flex-1"
                />
                {canPickContact ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 rounded-xl"
                    title="ייבוא מאנשי קשר"
                    aria-label="ייבוא מאנשי קשר"
                    onClick={() => void importFromContacts()}
                  >
                    <Contact className="size-4" />
                  </Button>
                ) : null}
              </div>
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
            {!lockLead ? (
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
            ) : null}
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={form.isExternal}
                onCheckedChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    isExternal: Boolean(v),
                    courseType: "",
                    courseCategory: "",
                    courseCategoryOther: "",
                    agreedPrice: Boolean(v) || f.isLead ? f.agreedPrice : "",
                  }))
                }
              />
              משתתף חיצוני
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={form.isLead}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isLead: Boolean(v) }))
                }
              />
              סמן כליד
            </label>
            {form.isExternal ? (
              <>
                <div>
                  <Label className="mb-1.5 block text-sm">
                    סוג קורס אישי לתעודה
                  </Label>
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
                      <SelectItem value={COURSE_TYPE_OTHER}>
                        {COURSE_TYPE_OTHER}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.courseType === COURSE_TYPE_OTHER ? (
                  <div>
                    <Label className="mb-1.5 block text-sm">סוג קורס חדש</Label>
                    <Input
                      value={form.courseTypeOther}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          courseTypeOther: e.target.value,
                        }))
                      }
                      placeholder='לדוגמה: 22, רענון 8, BLS'
                    />
                  </div>
                ) : null}
                <div>
                  <Label className="mb-1.5 block text-sm">קטגוריה</Label>
                  <Select
                    value={
                      form.courseCategory === CATEGORY_OTHER ||
                      (form.courseCategoryOther &&
                        form.courseCategory === CATEGORY_OTHER)
                        ? CATEGORY_OTHER
                        : form.courseCategory || undefined
                    }
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        courseCategory: v ?? "",
                        courseCategoryOther:
                          v === CATEGORY_OTHER ? f.courseCategoryOther : "",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחר קטגוריה" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                      <SelectItem value={CATEGORY_OTHER}>
                        {CATEGORY_OTHER}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.courseCategory === CATEGORY_OTHER ? (
                  <div>
                    <Label className="mb-1.5 block text-sm">קטגוריה חדשה</Label>
                    <Input
                      value={form.courseCategoryOther}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          courseCategoryOther: e.target.value,
                        }))
                      }
                      placeholder="הקלידו קטגוריה מותאמת"
                    />
                  </div>
                ) : null}
                <div>
                  <Label className="mb-1.5 block text-sm">מחיר</Label>
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
              </>
            ) : form.isLead ? (
              <div>
                <Label className="mb-1.5 block text-sm">מחיר אופציה</Label>
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
            ) : null}
          </div>

          <DialogFooter className="sticky bottom-0 z-10 mt-0 shrink-0 border-t border-border bg-background p-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "שומר…" : "שמור משתתף"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
