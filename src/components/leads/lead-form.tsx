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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  COURSE_TYPE_FORMAT_ERROR,
  COURSE_TYPE_OTHER,
  collectCourseTypeOptions,
  findCourseCatalog,
  formatLeadCourseType,
  isAllowedCourseTypeValue,
  isKindergartenRefreshCourseType,
  resolveCourseTypeForSave,
} from "@/lib/course-type"
import {
  InstructorSelectField,
  initialInstructorAssignValue,
  resolvedInstructorName,
  type InstructorAssignValue,
} from "@/components/instructors/instructor-select-field"
import { ensureCustomCourseTypeOption, ensureInstructor } from "@/lib/actions"
import {
  calcTotal,
  cleanPhone,
  formatCurrency,
  uid,
} from "@/lib/helpers"
import {
  isInstructorUnassigned,
  isOwnerInstructor,
  UNASSIGNED_INSTRUCTOR,
} from "@/lib/instructor"
import { addHoursToTime } from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

const FORM_STEPS = ["details", "course", "logistics"] as const
type FormStep = (typeof FORM_STEPS)[number]

interface Props {
  existing?: Lead
}

const OTHER = "אחר"

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((v) => v.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "he"),
  )
}

export function LeadForm({ existing }: Props) {
  const router = useRouter()
  const { addLead, updateLead, settings, findClientByPhone, leads, instructors } =
    useApp()

  const categoryOptions = useMemo(() => {
    const fromDb: string[] = []
    for (const l of leads) {
      if (l.category && l.category !== OTHER) fromDb.push(l.category)
      if (l.categoryOther) fromDb.push(l.categoryOther)
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

  const initialInstructorAssign = initialInstructorAssignValue(
    existing,
    instructors,
  )

  const initialCourseLabel = existing
    ? formatLeadCourseType(existing, settings.courses)
    : "44"
  const initialCourseSelect =
    !existing
      ? COURSE_TYPE_OTHER
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
      status: "new",
      customerType: "new",
      courseType: "44",
      courseHours: settings.courses.find((c) => c.type === "44_hours")?.hours ?? 44,
      category: OTHER,
      pricingType: "global",
      pricePerUnit: 0,
      extraParticipantPrice: 50,
      participantsCount: 25,
      totalPrice: 0,
      certificateDelivery: "עזרה ורפואה",
      instructor: UNASSIGNED_INSTRUCTOR,
      notes: "",
      address: { street: "", houseNumber: "", city: "", zip: "" },
      participants: [],
      expenses: [],
      isPrivateCourse: false,
      sessionsCount: 1,
      sessions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  )
  const [courseTypeSelect, setCourseTypeSelect] = useState(initialCourseSelect)
  const [courseTypeOther, setCourseTypeOther] = useState(initialCourseOtherText)
  const [categorySelect, setCategorySelect] = useState(initialCategorySelect)

  const showKindergartenRefreshFields = useMemo(() => {
    if (form.isPrivateCourse) return false
    if (courseTypeSelect === COURSE_TYPE_OTHER) {
      return isKindergartenRefreshCourseType(COURSE_TYPE_OTHER, courseTypeOther)
    }
    // לא מעבירים courseTypeOther — מונע זיהוי שגוי מערך ישן תקוע
    return isKindergartenRefreshCourseType(courseTypeSelect)
  }, [form.isPrivateCourse, courseTypeSelect, courseTypeOther])
  const [instructorAssign, setInstructorAssign] =
    useState<InstructorAssignValue>(initialInstructorAssign)
  const [globalPrice, setGlobalPrice] = useState(
    existing?.pricingType === "global" ? existing.totalPrice : 0,
  )
  const [dupWarn, setDupWarn] = useState<{ name: string; id: string } | null>(
    null,
  )
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [wizardStep, setWizardStep] = useState<FormStep>("details")
  const [savedFlash, setSavedFlash] = useState(false)
  const [saving, setSaving] = useState(false)
  const initialSessionsCount = Math.max(1, existing?.sessionsCount || existing?.sessions?.length || 1)
  const [sessionsMode, setSessionsMode] = useState<"1" | "2" | "3" | "other">(
    initialSessionsCount === 1
      ? "1"
      : initialSessionsCount === 2
        ? "2"
        : initialSessionsCount === 3
          ? "3"
          : "other",
  )
  const [sessionsOtherCount, setSessionsOtherCount] = useState(
    initialSessionsCount > 3 ? String(initialSessionsCount) : "",
  )
  const isNew = !existing
  const sectionRefs = useRef<Partial<Record<FormStep, HTMLElement | null>>>({})
  const scrollingToStep = useRef(false)

  const resolvedSessionsCount = useMemo(() => {
    if (sessionsMode === "other") {
      const n = Number(sessionsOtherCount)
      return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 12) : 1
    }
    return Number(sessionsMode)
  }, [sessionsMode, sessionsOtherCount])

  const sessionSlots = useMemo(() => {
    const existingSessions = form.sessions?.length
      ? form.sessions
      : form.date || form.time
        ? [
            {
              date: form.date,
              time: form.time,
              endTime: form.endTime,
              city: form.address.city,
              street: form.address.street,
              houseNumber: form.address.houseNumber,
            },
          ]
        : []
    return Array.from({ length: resolvedSessionsCount }, (_, i) => {
      const s = existingSessions[i]
      // אם יש רשומת מפגש — מכבדים גם מחרוזת ריקה (ניקוי), בלי נפילה ל-form.date
      return {
        date: s ? String(s.date ?? "") : i === 0 ? form.date || "" : "",
        time: s ? String(s.time ?? "") : i === 0 ? form.time || "" : "",
        endTime: s ? String(s.endTime ?? "") : i === 0 ? form.endTime || "" : "",
        isZoom: Boolean(s?.isZoom),
        zoomLink: s?.zoomLink || "",
        city: s?.city || (i === 0 ? form.address.city || "" : ""),
        street: s?.street || (i === 0 ? form.address.street || "" : ""),
        houseNumber:
          s?.houseNumber || (i === 0 ? form.address.houseNumber || "" : ""),
      }
    })
  }, [
    resolvedSessionsCount,
    form.sessions,
    form.date,
    form.time,
    form.endTime,
    form.address.city,
    form.address.street,
    form.address.houseNumber,
  ])

  const setSessionSlot = (
    index: number,
    patch: Partial<{
      date: string
      time: string
      endTime: string
      isZoom: boolean
      zoomLink: string
      city: string
      street: string
      houseNumber: string
    }>,
  ) => {
    const next = sessionSlots.map((s, i) => {
      if (i !== index) return s
      const merged = { ...s, ...patch }
      if (patch.time != null && patch.endTime === undefined) {
        merged.endTime = patch.time.trim()
          ? addHoursToTime(patch.time, 4)
          : ""
      }
      return merged
    })
    const first = next[0]
    setForm((f) => ({
      ...f,
      sessionsCount: resolvedSessionsCount,
      sessions: next,
      // מאפשרים ניקוי מלא של תאריך/שעה ("" לא נופל חזרה לערך ישן)
      date: first?.date ?? "",
      time: first?.time ?? "",
      endTime: first?.endTime ?? "",
      address:
        index === 0 && !first?.isZoom
          ? {
              ...f.address,
              city: first?.city ?? f.address.city,
              street: first?.street ?? f.address.street,
              houseNumber: first?.houseNumber ?? f.address.houseNumber,
            }
          : f.address,
    }))
  }

  const goToStep = (step: FormStep) => {
    setWizardStep(step)
    scrollingToStep.current = true
    sectionRefs.current[step]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
    window.setTimeout(() => {
      scrollingToStep.current = false
    }, 500)
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingToStep.current) return
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const step = visible[0]?.target.getAttribute("data-step") as
          | FormStep
          | null
        if (step && FORM_STEPS.includes(step)) setWizardStep(step)
      },
      { rootMargin: "-15% 0px -55% 0px", threshold: [0.15, 0.35, 0.55] },
    )
    for (const step of FORM_STEPS) {
      const el = sectionRefs.current[step]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

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

  const importFromContacts = async (target: "primary" | "secondary" = "primary") => {
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
      if (!importedName && !importedTel) {
        toast.message("לא נמצאו שם או טלפון באיש הקשר שנבחר")
        return
      }

      // מילוי בלי דריסה — רק שדות ריקים
      if (target === "primary") {
        const cleaned = importedTel ? cleanPhone(importedTel) : ""
        setForm((f) => {
          const next = { ...f }
          if (importedName && !f.name.trim()) next.name = importedName
          if (importedName && !f.contactName?.trim()) next.contactName = importedName
          if (cleaned && !f.phone.trim()) next.phone = cleaned
          return next
        })
        if (cleaned && !form.phone.trim()) {
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
      } else {
        setForm((f) => {
          const next = { ...f }
          if (importedName && !f.contactNameSecondary?.trim()) {
            next.contactNameSecondary = importedName
          }
          if (importedTel && !f.phoneSecondary?.trim()) {
            next.phoneSecondary = cleanPhone(importedTel)
          }
          return next
        })
      }
      toast.success("איש הקשר יובא לטופס (ללא דריסת שדות קיימים)")
    } catch {
      // ביטול
    }
  }

  const validate = () => {
    const e: Record<string, boolean> = {}
    if (!form.name.trim()) e.name = true
    if (!form.phone.trim()) e.phone = true
    if (!form.isPrivateCourse) {
      if (courseTypeSelect === COURSE_TYPE_OTHER) {
        if (!courseTypeOther.trim()) {
          e.courseTypeOther = true
        } else if (!isAllowedCourseTypeValue(courseTypeOther)) {
          e.courseTypeOther = true
          toast.error(COURSE_TYPE_FORMAT_ERROR)
        }
      } else if (!isAllowedCourseTypeValue(courseTypeSelect)) {
        e.courseTypeOther = true
        toast.error(COURSE_TYPE_FORMAT_ERROR)
      }
    }
    if (sessionsMode === "other") {
      const n = Number(sessionsOtherCount)
      if (!Number.isFinite(n) || n < 1) e.sessionsOtherCount = true
    }
    // מפגשים מרובים מחייבים תאריך ושעה לכל מפגש
    if (resolvedSessionsCount >= 2) {
      for (let i = 0; i < sessionSlots.length; i++) {
        if (!sessionSlots[i].date?.trim() || !sessionSlots[i].time?.trim()) {
          e[`session_${i}`] = true
        }
      }
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

  const resolveInstructor = (): string =>
    resolvedInstructorName(instructorAssign)

  const save = async () => {
    if (!validate()) {
      toast.error("יש למלא את השדות הנדרשים")
      return
    }
    if (saving) return

    const { category, categoryOther } = resolveCategory()
    const courseResolved = form.isPrivateCourse
      ? { courseType: "", courseTypeOther: undefined as string | undefined }
      : resolveCourseTypeForSave(courseTypeSelect, courseTypeOther)
    const catalog = form.isPrivateCourse
      ? null
      : findCourseCatalog(courseResolved.courseType, settings.courses)
    const instructor = resolveInstructor()
    const unassigned = isInstructorUnassigned(instructor)
    const fee = isOwnerInstructor(instructor)
      ? 0
      : Number(instructorAssign.fee) || 0

    setSaving(true)
    try {
      let instructorName = instructor
      let instructorId: string | undefined

      if (unassigned) {
        instructorName = UNASSIGNED_INSTRUCTOR
        instructorId = undefined
      } else {
        // תעריף חי בפרופיל המדריך — מקור אמת (לא העתקה להוצאות)
        const ensured = await ensureInstructor(instructor, fee)
        if (!ensured.ok) {
          toast.error(ensured.error)
          return
        }
        instructorName = ensured.data.name
        instructorId = ensured.data.id
      }

      if (
        !form.isPrivateCourse &&
        courseResolved.courseType &&
        courseResolved.courseType !== COURSE_TYPE_OTHER
      ) {
        await ensureCustomCourseTypeOption(courseResolved.courseType)
      }

      const payload: Lead = {
        ...form,
        phone: cleanPhone(form.phone),
        phoneSecondary: form.phoneSecondary
          ? cleanPhone(form.phoneSecondary)
          : undefined,
        // מחיר גלובלי / מחושב — נשמר כ־agreedPrice ב־DB
        totalPrice: total,
        pricingType: form.pricingType,
        pricePerUnit: form.pricePerUnit,
        participantsCount: form.participantsCount,
        courseType: courseResolved.courseType,
        courseTypeOther: courseResolved.courseTypeOther,
        courseHours: catalog?.hours,
        category,
        categoryOther,
        instructor: instructorName,
        instructorId,
        // תעריף חי בפרופיל בלבד — מנקים דריסה ישנה/מועתקת
        instructorFeeOverride: undefined,
        // לא מעתיקים עלות מדריך להוצאות — החישוב דינמי מפרופיל המדריך
        expenses: form.expenses.filter((e) => e.type !== "מדריך"),
        isPrivateCourse: Boolean(form.isPrivateCourse),
        sessionsCount: resolvedSessionsCount,
        sessions: sessionSlots.map((s) => ({
          date: s.date,
          time: s.time,
          endTime: s.endTime || undefined,
          isZoom: Boolean(s.isZoom),
          zoomLink: s.isZoom ? s.zoomLink?.trim() || undefined : undefined,
          city: s.isZoom ? undefined : s.city || undefined,
          street: s.isZoom ? undefined : s.street || undefined,
          houseNumber: s.isZoom ? undefined : s.houseNumber || undefined,
        })),
        date: sessionSlots[0]?.date ?? "",
        time: sessionSlots[0]?.time ?? "",
        endTime: sessionSlots[0]?.endTime ?? "",
        address: (() => {
          const physical = sessionSlots.find((s) => !s.isZoom)
          return {
            street: physical?.street || "",
            houseNumber: physical?.houseNumber || "",
            city: physical?.city || "",
            zip: form.address.zip,
          }
        })(),
      }

      if (existing) {
        const ok = await updateLead(existing.id, payload)
        if (!ok) return
        toast.success("השינויים נשמרו בהצלחה")
        router.push(`/leads/${existing.id}`)
        return
      }

      addLead(payload)
      toast.success("ליד חדש נוצר")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שמירת השינויים נכשלה")
    } finally {
      setSaving(false)
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

      <div className="mx-auto w-full max-w-xl overflow-visible p-4 md:max-w-3xl md:px-6 md:py-6">
        {dupWarn && (
          <Card className="mb-3 gap-1 border-warning/40 bg-warning/10 p-3">
            <p className="text-sm font-semibold text-warning-foreground">
              קיים כבר לקוח בשם {dupWarn.name} — ניתן ליצור הדרכה נוספת, והיא
              תשויך לרשומה הקיימת.
            </p>
            <a
              href={`/clients/${dupWarn.id}`}
              className="text-xs font-medium text-primary underline"
            >
              מעבר לרשומה הקיימת
            </a>
          </Card>
        )}

        <label className="mb-3 flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2.5 text-sm">
          <Checkbox
            checked={Boolean(form.isPrivateCourse)}
            onCheckedChange={(v) => {
              const next = Boolean(v)
              set("isPrivateCourse", next)
              if (next) {
                set("courseType", "")
                set("courseTypeOther", undefined)
                set("courseHours", undefined)
                if (wizardStep === "course") goToStep("details")
              }
            }}
          />
          <span className="font-semibold text-pink-800">קורס פרטי</span>
        </label>

        <Tabs
          value={wizardStep}
          onValueChange={(v) => goToStep(v as FormStep)}
          dir="rtl"
          className="overflow-visible"
        >
          <TabsList
            className={
              form.isPrivateCourse
                ? "sticky top-[57px] z-20 grid w-full grid-cols-2"
                : "sticky top-[57px] z-20 grid w-full grid-cols-3"
            }
          >
            <TabsTrigger value="details">פרטים</TabsTrigger>
            {!form.isPrivateCourse ? (
              <TabsTrigger value="course">קורס ותמחור</TabsTrigger>
            ) : null}
            <TabsTrigger value="logistics">מיקום הדרכה</TabsTrigger>
          </TabsList>
        </Tabs>

          <section
            data-step="details"
            ref={(el) => {
              sectionRefs.current.details = el
            }}
            className="mt-4 scroll-mt-28 space-y-4 overflow-visible"
          >            <Field label="שם הלקוח / הארגון" error={errors.name} required>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="לדוגמה: גן שמש / מעון הדס"
              />
            </Field>

            <div className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  איש קשר ראשי
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-xl"
                  title="ייבא מאישי קשר"
                  aria-label="ייבא איש קשר ראשי"
                  onClick={() => void importFromContacts("primary")}
                >
                  <ContactRound className="size-4" />
                  ייבוא
                </Button>
              </div>
              <Field label="שם איש קשר">
                <Input
                  value={form.contactName ?? ""}
                  onChange={(e) => set("contactName", e.target.value)}
                  placeholder="שם איש הקשר הראשי"
                />
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
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  איש קשר משני
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-xl"
                  title="ייבא מאישי קשר"
                  aria-label="ייבא איש קשר משני"
                  onClick={() => void importFromContacts("secondary")}
                >
                  <ContactRound className="size-4" />
                  ייבוא
                </Button>
              </div>
              <Field label="שם איש קשר משני">
                <Input
                  value={form.contactNameSecondary ?? ""}
                  onChange={(e) =>
                    set("contactNameSecondary", e.target.value)
                  }
                  placeholder="שם איש הקשר המשני"
                />
              </Field>
              <Field label="טלפון משני">
                <Input
                  value={form.phoneSecondary ?? ""}
                  onChange={(e) => set("phoneSecondary", e.target.value)}
                  placeholder="050-0000000"
                  inputMode="tel"
                  dir="ltr"
                  className="text-right"
                />
              </Field>
            </div>

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

            <Field label="הערות">
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="הערות פנימיות לליד"
              />
            </Field>
          </section>

          {!form.isPrivateCourse ? (
          <section
            data-step="course"
            ref={(el) => {
              sectionRefs.current.course = el
            }}
            className="mt-8 scroll-mt-28 space-y-4 overflow-visible border-t border-border pt-6"
          >            <Field
              label="סוג קורס"
              error={errors.courseTypeOther}
              errorMessage={
                errors.courseTypeOther &&
                courseTypeSelect !== COURSE_TYPE_OTHER
                  ? COURSE_TYPE_FORMAT_ERROR
                  : undefined
              }
            >
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
              <Field
                label="סוג קורס חדש"
                required
                error={errors.courseTypeOther}
                errorMessage={
                  errors.courseTypeOther && courseTypeOther.trim()
                    ? COURSE_TYPE_FORMAT_ERROR
                    : errors.courseTypeOther
                      ? "שדה חובה"
                      : undefined
                }
              >
                <Input
                  value={courseTypeOther}
                  onChange={(e) => {
                    setCourseTypeOther(e.target.value)
                    set("courseTypeOther", e.target.value)
                  }}
                  placeholder='לדוגמה: 22, רענון 8, התנהלות בטוחה'
                />
              </Field>
            )}

            {showKindergartenRefreshFields ? (
              <div className="space-y-4 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4">
                <p className="text-sm font-semibold text-amber-950">
                  פרטי מעון / גן
                </p>
                <p className="text-xs text-muted-foreground">
                  שדות אופציונליים לשליחה ליוסי עמר
                </p>
                <Field label="שם מנהלת הגן/מעון">
                  <Input
                    value={form.kindergartenManagerName || ""}
                    onChange={(e) =>
                      set("kindergartenManagerName", e.target.value)
                    }
                    placeholder="שם מנהלת"
                  />
                </Field>
                <Field label="טלפון מנהלת הגן/מעון">
                  <Input
                    value={form.kindergartenManagerPhone || ""}
                    onChange={(e) =>
                      set("kindergartenManagerPhone", e.target.value)
                    }
                    placeholder="טלפון"
                    inputMode="tel"
                    dir="ltr"
                  />
                </Field>
                <Field label="סמל מוסד/מעון">
                  <Input
                    value={form.institutionSymbol || ""}
                    onChange={(e) => set("institutionSymbol", e.target.value)}
                    placeholder="סמל מוסד"
                  />
                </Field>
                <Field label="תאריך הכשרה בסיסית">
                  <Input
                    type="date"
                    value={form.basicTrainingDate || ""}
                    onChange={(e) => set("basicTrainingDate", e.target.value)}
                    dir="ltr"
                  />
                </Field>
              </div>
            ) : null}

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
              <div className="space-y-3">
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
                <Field label="כמות משתתפים משוערת">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.participantsCount || ""}
                    onChange={(e) => {
                      const v = e.target.value
                      set("participantsCount", v === "" ? 0 : Number(v))
                    }}
                    placeholder="כמה משתתפים בערך"
                  />
                </Field>
              </div>
            )}

            <Card className="flex-row items-center justify-between bg-primary/5 p-4">
              <span className="text-sm font-semibold">מחיר כולל</span>
              <span className="text-xl font-extrabold text-primary">
                {formatCurrency(total)}
              </span>
            </Card>
          </section>
          ) : null}

          <section
            data-step="logistics"
            ref={(el) => {
              sectionRefs.current.logistics = el
            }}
            className="mt-8 scroll-mt-28 space-y-4 overflow-visible border-t border-border pt-6"
          >
            <div className="space-y-2">
              <Label className="text-sm">מספר מפגשים</Label>
              <div className="grid grid-cols-4 gap-2">
                {(["1", "2", "3", "other"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSessionsMode(mode)
                      const count =
                        mode === "other"
                          ? Math.max(1, Number(sessionsOtherCount) || 1)
                          : Number(mode)
                      setForm((f) => {
                        const base =
                          f.sessions?.length
                            ? f.sessions
                            : f.date || f.time
                              ? [
                                  {
                                    date: f.date,
                                    time: f.time,
                                    endTime: f.endTime,
                                  },
                                ]
                              : []
                        const next = Array.from({ length: count }, (_, i) => ({
                          date:
                            base[i]?.date != null
                              ? String(base[i]?.date ?? "")
                              : i === 0
                                ? f.date || ""
                                : "",
                          time:
                            base[i]?.time != null
                              ? String(base[i]?.time ?? "")
                              : i === 0
                                ? f.time || ""
                                : "",
                          endTime:
                            base[i]?.endTime != null
                              ? String(base[i]?.endTime ?? "")
                              : i === 0
                                ? f.endTime || ""
                                : "",
                        }))
                        return {
                          ...f,
                          sessionsCount: count,
                          sessions: next,
                          date: next[0]?.date ?? "",
                          time: next[0]?.time ?? "",
                          endTime: next[0]?.endTime ?? "",
                        }
                      })
                    }}
                    className={
                      sessionsMode === mode
                        ? "rounded-xl border-2 border-primary bg-primary/10 py-2 text-sm font-semibold text-primary"
                        : "rounded-xl border border-border bg-card py-2 text-sm text-muted-foreground"
                    }
                  >
                    {mode === "other" ? "אחר" : mode}
                  </button>
                ))}
              </div>
              {sessionsMode === "other" && (
                <Field
                  label="כמה מפגשים?"
                  error={errors.sessionsOtherCount}
                  required
                >
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={sessionsOtherCount}
                    onChange={(e) => {
                      setSessionsOtherCount(e.target.value)
                      const n = Number(e.target.value)
                      if (!Number.isFinite(n) || n < 1) return
                      const count = Math.min(Math.floor(n), 12)
                      setForm((f) => {
                        const base =
                          f.sessions?.length
                            ? f.sessions
                            : f.date || f.time
                              ? [
                                  {
                                    date: f.date,
                                    time: f.time,
                                    endTime: f.endTime,
                                  },
                                ]
                              : []
                        const next = Array.from(
                          { length: count },
                          (_, i) => ({
                            date:
                              base[i]?.date != null
                                ? String(base[i]?.date ?? "")
                                : i === 0
                                  ? f.date || ""
                                  : "",
                            time:
                              base[i]?.time != null
                                ? String(base[i]?.time ?? "")
                                : i === 0
                                  ? f.time || ""
                                  : "",
                            endTime:
                              base[i]?.endTime != null
                                ? String(base[i]?.endTime ?? "")
                                : i === 0
                                  ? f.endTime || ""
                                  : "",
                          }),
                        )
                        return {
                          ...f,
                          sessionsCount: count,
                          sessions: next,
                          date: next[0]?.date ?? "",
                          time: next[0]?.time ?? "",
                          endTime: next[0]?.endTime ?? "",
                        }
                      })
                    }}
                    dir="ltr"
                  />
                </Field>
              )}
            </div>

            {sessionSlots.map((slot, idx) => (
              <div
                key={`session-${idx}`}
                className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3"
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {sessionSlots.length > 1
                    ? `מפגש ${idx + 1}`
                    : "מפגש הדרכה"}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field
                    label="תאריך"
                    error={errors[`session_${idx}`]}
                    required={resolvedSessionsCount >= 2}
                  >
                    <Input
                      type="date"
                      value={slot.date}
                      onChange={(e) =>
                        setSessionSlot(idx, { date: e.target.value })
                      }
                      dir="ltr"
                    />
                  </Field>
                  <Field
                    label="משעה"
                    error={errors[`session_${idx}`]}
                    required={resolvedSessionsCount >= 2}
                  >
                    <Input
                      type="time"
                      value={slot.time}
                      onChange={(e) =>
                        setSessionSlot(idx, { time: e.target.value })
                      }
                      dir="ltr"
                    />
                  </Field>
                  <Field label="עד שעה">
                    <Input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) =>
                        setSessionSlot(idx, { endTime: e.target.value })
                      }
                      dir="ltr"
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(slot.isZoom)}
                    onCheckedChange={(v) =>
                      setSessionSlot(idx, {
                        isZoom: Boolean(v),
                        zoomLink: Boolean(v) ? slot.zoomLink : "",
                      })
                    }
                  />
                  <span className="font-medium">מפגש בזום</span>
                </label>
                {slot.isZoom ? (
                  <Field label="קישור לזום">
                    <Input
                      type="text"
                      inputMode="url"
                      placeholder="https://zoom.us/j/…"
                      value={slot.zoomLink || ""}
                      onChange={(e) =>
                        setSessionSlot(idx, { zoomLink: e.target.value })
                      }
                      dir="ltr"
                    />
                  </Field>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="עיר" className="col-span-1">
                      <Input
                        value={slot.city}
                        onChange={(e) =>
                          setSessionSlot(idx, { city: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="רחוב" className="col-span-1">
                      <Input
                        value={slot.street}
                        onChange={(e) =>
                          setSessionSlot(idx, { street: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="מס' בית">
                      <Input
                        value={slot.houseNumber}
                        onChange={(e) =>
                          setSessionSlot(idx, { houseNumber: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            ))}

            <Field label="מדריך">
              <InstructorSelectField
                value={instructorAssign}
                onChange={(next) => {
                  setInstructorAssign(next)
                  set("instructor", next.instructorName)
                }}
                error={errors.instructorOther}
              />
            </Field>
            {!isInstructorUnassigned(instructorAssign.selectValue) &&
              !isOwnerInstructor(instructorAssign.selectValue) && (
              <Field label="תעריף מדריך חי (₪)">
                <Input
                  type="number"
                  min={0}
                  value={instructorAssign.fee}
                  onChange={(e) =>
                    setInstructorAssign((prev) => ({
                      ...prev,
                      fee: e.target.value,
                    }))
                  }
                  placeholder="מתעדכן בפרופיל המדריך"
                  dir="ltr"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  נשמר בפרופיל המדריך ומשמש לחישוב רווח בכל ההדרכות שלו
                </p>
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

            {!form.isPrivateCourse &&
            (form.category === "גני ילדים" ||
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
          </section>

        {isNew ? (
          <div className="mt-6 flex gap-2">
            {wizardStep !== "details" && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-2xl py-6"
                onClick={() =>
                  goToStep(
                    wizardStep === "logistics"
                      ? form.isPrivateCourse
                        ? "details"
                        : "course"
                      : "details",
                  )
                }
              >
                חזרה
              </Button>
            )}
            {wizardStep !== "logistics" ? (
              <Button
                type="button"
                className="flex-1 rounded-2xl py-6 text-base"
                onClick={() =>
                  goToStep(
                    wizardStep === "details"
                      ? form.isPrivateCourse
                        ? "logistics"
                        : "course"
                      : "logistics",
                  )
                }
              >
                המשך
              </Button>
            ) : (
              <Button
                onClick={() => void save()}
                className="flex-1 rounded-2xl py-6 text-base"
                disabled={saving}
              >
                {saving ? "שומר…" : "צור ליד"}
              </Button>
            )}
          </div>
        ) : (
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="mt-6 w-full rounded-2xl py-6 text-base"
          >
            {saving ? "שומר…" : "שמור שינויים"}
          </Button>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  error,
  errorMessage,
  required,
  className,
}: {
  label: string
  children: React.ReactNode
  error?: boolean
  errorMessage?: string
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
      {error && errorMessage ? (
        <p className="mt-1.5 text-xs leading-relaxed text-destructive">
          {errorMessage}
        </p>
      ) : null}
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
