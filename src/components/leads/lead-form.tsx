"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Check, ContactRound } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  COURSE_TYPE_OTHER,
  collectCourseTypeOptions,
  findCourseCatalog,
  formatLeadCourseType,
  resolveCourseTypeForSave,
} from "@/lib/course-type"
import {
  calcTotal,
  cleanPhone,
  formatCurrency,
  uid,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

interface Props {
  existing?: Lead
}

const OTHER = "אחר"
const DEFAULT_INSTRUCTOR = "יצחק"

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((v) => v.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "he"),
  )
}

export function LeadForm({ existing }: Props) {
  const router = useRouter()
  const { addLead, updateLead, settings, findClientByPhone, leads } = useApp()

  const categoryOptions = useMemo(() => {
    const fromDb: string[] = []
    for (const l of leads) {
      if (l.category && l.category !== OTHER) fromDb.push(l.category)
      if (l.categoryOther) fromDb.push(l.categoryOther)
    }
    return uniqueSorted(fromDb)
  }, [leads])

  const instructorOptions = useMemo(() => {
    const fromDb: string[] = [DEFAULT_INSTRUCTOR]
    for (const l of leads) {
      if (l.instructor && l.instructor !== OTHER) fromDb.push(l.instructor)
    }
    return uniqueSorted(fromDb)
  }, [leads])

  const courseTypeOptions = useMemo(
    () => collectCourseTypeOptions(leads, settings.courses),
    [leads, settings.courses],
  )

  const initialCategorySelect = (() => {
    if (!existing) return OTHER
    if (existing.category === OTHER || existing.categoryOther) return OTHER
    if (categoryOptions.includes(existing.category)) return existing.category
    return existing.category || OTHER
  })()

  const initialInstructorSelect = (() => {
    if (!existing?.instructor) return DEFAULT_INSTRUCTOR
    if (instructorOptions.includes(existing.instructor)) return existing.instructor
    return OTHER
  })()

  const initialCourseLabel = existing
    ? formatLeadCourseType(existing, settings.courses)
    : "44 שעות"
  const initialCourseSelect =
    !existing
      ? "44 שעות"
      : existing.courseType === "other" ||
          existing.courseType === COURSE_TYPE_OTHER ||
          !courseTypeOptions.includes(initialCourseLabel)
        ? COURSE_TYPE_OTHER
        : initialCourseLabel
  const initialCourseOtherText =
    initialCourseSelect === COURSE_TYPE_OTHER
      ? existing?.courseTypeOther?.trim() ||
        (initialCourseLabel !== COURSE_TYPE_OTHER ? initialCourseLabel : "") ||
        ""
      : ""

  const [form, setForm] = useState<Lead>(
    existing ?? {
      id: uid("l"),
      clientId: uid("c"),
      name: "",
      phone: "",
      email: "",
      urgent: false,
      status: "new",
      customerType: "new",
      courseType: "44_hours",
      courseHours: settings.courses.find((c) => c.type === "44_hours")?.hours ?? 44,
      category: OTHER,
      pricingType: "per_participant",
      pricePerUnit: 0,
      extraParticipantPrice: 50,
      participantsCount: 1,
      totalPrice: 0,
      certificateDelivery: "עזרה ורפואה",
      instructor: DEFAULT_INSTRUCTOR,
      notes: "",
      address: { street: "", houseNumber: "", city: "", zip: "" },
      participants: [],
      expenses: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  )
  const [courseTypeSelect, setCourseTypeSelect] = useState(initialCourseSelect)
  const [courseTypeOther, setCourseTypeOther] = useState(initialCourseOtherText)
  const [categorySelect, setCategorySelect] = useState(initialCategorySelect)
  const [instructorSelect, setInstructorSelect] = useState(initialInstructorSelect)
  const [instructorOther, setInstructorOther] = useState(
    initialInstructorSelect === OTHER ? existing?.instructor ?? "" : "",
  )
  const [globalPrice, setGlobalPrice] = useState(
    existing?.pricingType === "global" ? existing.totalPrice : 0,
  )
  const [dupWarn, setDupWarn] = useState<{ name: string; id: string } | null>(
    null,
  )
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [savedFlash, setSavedFlash] = useState(false)

  const set = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const total = useMemo(
    () =>
      calcTotal(
        form.pricingType,
        form.pricePerUnit,
        form.participantsCount,
        globalPrice,
      ),
    [form.pricingType, form.pricePerUnit, form.participantsCount, globalPrice],
  )

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(() => {
      setSavedFlash(true)
      const h = setTimeout(() => setSavedFlash(false), 1200)
      return () => clearTimeout(h)
    }, 800)
    return () => clearTimeout(t)
  }, [form])

  const handlePhoneBlur = () => {
    if (!form.phone) return
    const cleaned = cleanPhone(form.phone)
    set("phone", cleaned)
    const existingClient = findClientByPhone(cleaned)
    if (existingClient && (!existing || existing.clientId !== existingClient.id)) {
      setDupWarn({ name: existingClient.name, id: existingClient.id })
      set("customerType", "existing")
    } else {
      setDupWarn(null)
    }
  }

  const importFromContacts = async () => {
    type ContactInfo = { name?: string[]; tel?: string[] }
    type ContactsManager = {
      select: (
        properties: string[],
        options?: { multiple?: boolean },
      ) => Promise<ContactInfo[]>
    }
    const nav = navigator as Navigator & { contacts?: ContactsManager }
    if (!nav.contacts || !("select" in nav.contacts)) {
      toast.message(
        "אפשרות ייבוא אנשי קשר זמינה בעיקר מכשירים ניידים בדפדפני Chrome/Safari",
      )
      return
    }
    try {
      const selected = await nav.contacts.select(["name", "tel"], {
        multiple: false,
      })
      const contact = selected?.[0]
      if (!contact) return
      const importedName = contact.name?.[0]?.trim() || ""
      const importedTel = contact.tel?.[0]?.trim() || ""
      if (importedName) set("name", importedName)
      if (importedTel) {
        const cleaned = cleanPhone(importedTel)
        set("phone", cleaned)
        const existingClient = findClientByPhone(cleaned)
        if (
          existingClient &&
          (!existing || existing.clientId !== existingClient.id)
        ) {
          setDupWarn({ name: existingClient.name, id: existingClient.id })
          set("customerType", "existing")
        } else {
          setDupWarn(null)
        }
      }
      if (importedName || importedTel) {
        toast.success("איש הקשר יובא לטופס")
      } else {
        toast.message("לא נמצאו שם או טלפון באיש הקשר שנבחר")
      }
    } catch {
      // משתמש ביטל את הבחירה / הרשאה נדחתה
    }
  }

  const validate = () => {
    const e: Record<string, boolean> = {}
    if (!form.name.trim()) e.name = true
    if (!form.phone.trim()) e.phone = true
    if (courseTypeSelect === COURSE_TYPE_OTHER && !courseTypeOther.trim()) {
      e.courseTypeOther = true
    }
    if (instructorSelect === OTHER && !instructorOther.trim()) {
      e.instructorOther = true
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const resolveCategory = (): { category: string; categoryOther?: string } => {
    if (categorySelect === OTHER) {
      const custom = form.categoryOther?.trim() || ""
      // שומרים את השם החדש כקטגוריה כדי שיופיע ברשימה בפעם הבאה
      return { category: custom || OTHER, categoryOther: custom || undefined }
    }
    return { category: categorySelect, categoryOther: undefined }
  }

  const resolveInstructor = (): string => {
    if (instructorSelect === OTHER) return instructorOther.trim()
    return instructorSelect
  }

  const save = () => {
    if (!validate()) {
      toast.error("יש למלא את השדות הנדרשים")
      return
    }
    const { category, categoryOther } = resolveCategory()
    const courseResolved = resolveCourseTypeForSave(courseTypeSelect, courseTypeOther)
    const catalog = findCourseCatalog(courseResolved.courseType, settings.courses)
    const payload: Lead = {
      ...form,
      phone: cleanPhone(form.phone),
      totalPrice: total,
      courseType: courseResolved.courseType,
      courseTypeOther: courseResolved.courseTypeOther,
      courseHours: catalog?.hours,
      category,
      categoryOther,
      instructor: resolveInstructor(),
    }
    if (existing) {
      updateLead(existing.id, payload)
      toast.success("הליד עודכן")
      router.push(`/leads/${existing.id}`)
    } else {
      addLead(payload)
      toast.success("ליד חדש נוצר")
    }
  }

  const categorySelectValue =
    categorySelect === OTHER
      ? OTHER
      : categoryOptions.includes(categorySelect)
        ? categorySelect
        : categorySelect || OTHER

  return (
    <div>
      <PageHeader
        title={existing ? "עריכת ליד" : "ליד חדש"}
        subtitle={savedFlash ? "נשמר אוטומטית" : "מלא את הפרטים"}
        back={
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="חזרה"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <ArrowRight className="size-5" />
          </button>
        }
        action={
          savedFlash ? (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <Check className="size-4" /> נשמר
            </span>
          ) : undefined
        }
      />

      <div className="overflow-visible p-4">
        {dupWarn && (
          <Card className="mb-3 gap-1 border-warning/40 bg-warning/10 p-3">
            <p className="text-sm font-semibold text-warning-foreground">
              קיים כבר לקוח בשם {dupWarn.name}
            </p>
            <a
              href={`/clients/${dupWarn.id}`}
              className="text-xs font-medium text-primary underline"
            >
              מעבר לרשומה הקיימת
            </a>
          </Card>
        )}

        <Tabs defaultValue="details" dir="rtl" className="overflow-visible">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">פרטים</TabsTrigger>
            <TabsTrigger value="course">קורס ותמחור</TabsTrigger>
            <TabsTrigger value="logistics">מיקום הדרכה</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4 overflow-visible">
            <Field label="שם הלקוח / הארגון" error={errors.name} required>
              <div className="flex items-center gap-2">
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="לדוגמה: גן שמש"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10 shrink-0 rounded-xl"
                  title="ייבא מאישי קשר"
                  aria-label="ייבא מאישי קשר"
                  onClick={importFromContacts}
                >
                  <ContactRound className="size-5" />
                </Button>
              </div>
            </Field>
            <Field label="טלפון" error={errors.phone} required>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="050-0000000"
                inputMode="tel"
                dir="ltr"
                className="text-right"
              />
            </Field>
            <Field label="דוא״ל">
              <Input
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="mail@example.com"
                inputMode="email"
                dir="ltr"
                className="text-right"
              />
            </Field>
            <Field label="איש קשר">
              <Input
                value={form.contactName ?? ""}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="שם איש הקשר"
              />
            </Field>

            <Field label="הערות">
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="הערות פנימיות לליד"
              />
            </Field>

            <Card className="flex-row items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold">סימון כדחוף</p>
                <p className="text-xs text-muted-foreground">
                  יודגש באדום ויעלה לראש הרשימה
                </p>
              </div>
              <Switch
                checked={form.urgent}
                onCheckedChange={(v) => set("urgent", v)}
              />
            </Card>
          </TabsContent>

          <TabsContent value="course" className="mt-4 space-y-4 overflow-visible">
            <Field label="סוג קורס" error={errors.courseTypeOther}>
              <Select
                value={courseTypeSelect}
                onValueChange={(v) => {
                  const next = v ?? COURSE_TYPE_OTHER
                  setCourseTypeSelect(next)
                  if (next !== COURSE_TYPE_OTHER) {
                    const resolved = resolveCourseTypeForSave(next)
                    set("courseType", resolved.courseType)
                    set("courseTypeOther", undefined)
                    setCourseTypeOther("")
                    const cat = findCourseCatalog(resolved.courseType, settings.courses)
                    if (cat?.hours) set("courseHours", cat.hours)
                  } else {
                    set("courseType", COURSE_TYPE_OTHER)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר סוג קורס" />
                </SelectTrigger>
                <SelectContent
                  side="bottom"
                  align="start"
                  alignItemWithTrigger={false}
                  className="max-h-[min(280px,70vh)]"
                >
                  {courseTypeOptions.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                  <SelectItem value={COURSE_TYPE_OTHER}>{COURSE_TYPE_OTHER}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {courseTypeSelect === COURSE_TYPE_OTHER && (
              <Field label="סוג קורס חדש" required error={errors.courseTypeOther}>
                <Input
                  value={courseTypeOther}
                  onChange={(e) => {
                    setCourseTypeOther(e.target.value)
                    set("courseTypeOther", e.target.value)
                  }}
                  placeholder='לדוגמה: קורס מגישי עזרה ראשונה 15 שעות'
                />
              </Field>
            )}

            <Field label="קטגוריה" error={errors.categoryOther}>
              <Select
                value={categorySelectValue}
                onValueChange={(v) => {
                  const next = v ?? OTHER
                  setCategorySelect(next)
                  if (next !== OTHER) {
                    set("category", next)
                    set("categoryOther", undefined)
                  } else {
                    set("category", OTHER)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="max-h-[min(280px,70vh)]">
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>{OTHER}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {categorySelect === OTHER && (
              <Field label="קטגוריה חדשה" required error={errors.categoryOther}>
                <Input
                  value={form.categoryOther ?? ""}
                  onChange={(e) => set("categoryOther", e.target.value)}
                  placeholder="לדוגמה: גננות, מורים…"
                />
              </Field>
            )}

            <Field label="שיטת תמחור">
              <div className="grid grid-cols-2 gap-2">
                <PillToggle
                  active={form.pricingType === "per_participant"}
                  onClick={() => set("pricingType", "per_participant")}
                  label="פר משתתף"
                />
                <PillToggle
                  active={form.pricingType === "global"}
                  onClick={() => set("pricingType", "global")}
                  label="מחיר גלובלי"
                />
              </div>
            </Field>

            {form.pricingType === "per_participant" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="מחיר ליחיד">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      value={form.pricePerUnit || ""}
                      onChange={(e) => {
                        const v = e.target.value
                        set("pricePerUnit", v === "" ? 0 : Number(v))
                      }}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="מספר משתתפים">
                    <Input
                      type="number"
                      inputMode="numeric"
                      step="any"
                      min={0}
                      value={form.participantsCount || ""}
                      onChange={(e) => {
                        const v = e.target.value
                        set("participantsCount", v === "" ? 0 : Number(v))
                      }}
                      placeholder="1"
                    />
                  </Field>
                </div>
                <Field label="תוספת למשתתף נוסף (₪)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={
                      form.extraParticipantPrice === undefined ||
                      form.extraParticipantPrice === null
                        ? ""
                        : form.extraParticipantPrice
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      set(
                        "extraParticipantPrice",
                        v === "" ? undefined : Number(v),
                      )
                    }}
                    placeholder="50"
                  />
                </Field>
              </div>
            ) : (
              <Field label="מחיר גלובלי">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={globalPrice || ""}
                  onChange={(e) => {
                    const v = e.target.value
                    setGlobalPrice(v === "" ? 0 : Number(v))
                  }}
                  placeholder="0"
                />
              </Field>
            )}

            <Card className="flex-row items-center justify-between bg-primary/5 p-4">
              <span className="text-sm font-semibold">מחיר כולל</span>
              <span className="text-xl font-extrabold text-primary">
                {formatCurrency(total)}
              </span>
            </Card>
          </TabsContent>

          <TabsContent value="logistics" className="mt-4 space-y-4 overflow-visible">
            <div className="grid grid-cols-2 gap-3">
              <Field label="תאריך">
                <Input
                  type="date"
                  value={form.date ?? ""}
                  onChange={(e) => set("date", e.target.value)}
                  dir="ltr"
                />
              </Field>
              <Field label="שעה">
                <Input
                  type="time"
                  value={form.time ?? ""}
                  onChange={(e) => set("time", e.target.value)}
                  dir="ltr"
                />
              </Field>
            </div>

            <Field label="מדריך" error={errors.instructorOther}>
              <Select
                value={instructorSelect}
                onValueChange={(v) => {
                  const next = v ?? DEFAULT_INSTRUCTOR
                  setInstructorSelect(next)
                  if (next !== OTHER) {
                    set("instructor", next)
                    setInstructorOther("")
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר מדריך" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="max-h-[min(280px,70vh)]">
                  {instructorOptions.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>{OTHER}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {instructorSelect === OTHER && (
              <Field label="שם מדריך חדש" required error={errors.instructorOther}>
                <Input
                  value={instructorOther}
                  onChange={(e) => setInstructorOther(e.target.value)}
                  placeholder="הזן שם מדריך"
                />
              </Field>
            )}

            <Field label="תעודות דרך מי">
              <Select
                value={form.certificateDelivery}
                onValueChange={(v) =>
                  set(
                    "certificateDelivery",
                    (v ?? "עזרה ורפואה") as Lead["certificateDelivery"],
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחר" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="עזרה ורפואה">עזרה ורפואה</SelectItem>
                  <SelectItem value="ניתאי">ניתאי</SelectItem>
                  <SelectItem value="יוסי">יוסי</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field label="רחוב" className="col-span-2">
                <Input
                  value={form.address.street}
                  onChange={(e) =>
                    set("address", { ...form.address, street: e.target.value })
                  }
                />
              </Field>
              <Field label="מס' בית">
                <Input
                  value={form.address.houseNumber}
                  onChange={(e) =>
                    set("address", {
                      ...form.address,
                      houseNumber: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="עיר">
                <Input
                  value={form.address.city}
                  onChange={(e) =>
                    set("address", { ...form.address, city: e.target.value })
                  }
                />
              </Field>
              <Field label="מיקוד (אופציונלי)">
                <Input
                  value={form.address.zip ?? ""}
                  onChange={(e) =>
                    set("address", { ...form.address, zip: e.target.value })
                  }
                  inputMode="numeric"
                />
              </Field>
            </div>

            {(form.category === "גני ילדים" ||
              form.categoryOther === "גני ילדים" ||
              categorySelect === "גני ילדים") && (
              <Card className="flex-row items-center gap-3 p-4">
                <Checkbox
                  id="kg"
                  checked={form.kindergartenApproval ?? false}
                  onCheckedChange={(v) =>
                    set("kindergartenApproval", Boolean(v))
                  }
                />
                <Label htmlFor="kg" className="text-sm">
                  התקבל אישור גננות
                </Label>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Button onClick={save} className="mt-6 w-full rounded-2xl py-6 text-base">
          {existing ? "שמור שינויים" : "צור ליד"}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  error,
  required,
  className,
}: {
  label: string
  children: React.ReactNode
  error?: boolean
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex items-center gap-1 text-sm">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className={error ? "[&_input]:border-destructive [&_input]:ring-destructive/20" : ""}>
        {children}
      </div>
    </div>
  )
}

function PillToggle({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl border-2 border-primary bg-primary/10 py-3 text-sm font-semibold text-primary"
          : "rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground"
      }
    >
      {label}
    </button>
  )
}
