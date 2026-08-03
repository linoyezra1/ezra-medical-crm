"use client"

import { useState } from "react"
import {
  CheckCircle2,
  ExternalLink,
  HeartHandshake,
  MessageSquareHeart,
  Package,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { submitPublicParticipant } from "@/lib/actions"
import {
  KIT_INTEREST_OPTIONS,
  SATISFACTION_OPTIONS,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const ZIP_HELPER_URL = "https://doar.israelpost.co.il/locatezip"

const fieldInputClass =
  "h-11 rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-sky-400 focus-visible:ring-sky-200/60"

type Props = {
  leadId: string
  businessName: string
  courseLabel: string
  courseDateDefault?: string
  organizerDefault?: string
  collectShipping: boolean
}

type FormState = {
  organizerName: string
  fullName: string
  idNumber: string
  courseDate: string
  email: string
  phone: string
  satisfaction: string
  feedback: string
  kitInterest: string
  shippingCity: string
  shippingStreet: string
  shippingHouseNo: string
  shippingZip: string
}

export function PublicParticipantForm({
  leadId,
  businessName,
  courseLabel,
  courseDateDefault,
  organizerDefault,
  collectShipping,
}: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({
    organizerName: organizerDefault || "",
    fullName: "",
    idNumber: "",
    courseDate: courseDateDefault || "",
    email: "",
    phone: "",
    satisfaction: "",
    feedback: "",
    kitInterest: "",
    shippingCity: "",
    shippingStreet: "",
    shippingHouseNo: "",
    shippingZip: "",
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await submitPublicParticipant(leadId, form)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky-50 via-slate-50 to-white px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="size-9" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          הטופס נשלח בהצלחה, תודה!
        </h1>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-sky-50 via-slate-50 to-white px-4 py-6 md:py-10">
      <div className="mx-auto mb-5 max-w-lg text-center md:mb-6">
        <p className="text-xs font-semibold tracking-wide text-sky-700">
          {businessName}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          הרשמת משתתף
        </h1>
        <p className="mt-1 text-sm text-slate-600">{courseLabel}</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="mx-auto max-w-lg space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-xl md:space-y-6 md:p-8"
      >
        {/* —— 1. פרטי הקורס והמשתתף —— */}
        <FormSection
          icon={<UserRound className="size-4" />}
          title="פרטי הקורס והמשתתף"
          tone="sky"
        >
          <Field label="שם מארגן / מזמין הקורס">
            <Input
              required
              value={form.organizerName}
              onChange={(e) => set("organizerName", e.target.value)}
              placeholder="שם המארגן"
              className={fieldInputClass}
            />
          </Field>

          <Field label="שם מלא">
            <Input
              required
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              placeholder="שם מלא של המשתתף"
              className={fieldInputClass}
            />
          </Field>

          <Field label="מספר תעודת זהות">
            <Input
              required
              value={form.idNumber}
              onChange={(e) => set("idNumber", e.target.value)}
              placeholder="000000000"
              inputMode="numeric"
              dir="ltr"
              className={cn(fieldInputClass, "text-right")}
            />
          </Field>

          <Field label="תאריך ביצוע הקורס">
            <Input
              required
              type="date"
              value={form.courseDate}
              onChange={(e) => set("courseDate", e.target.value)}
              dir="ltr"
              className={fieldInputClass}
            />
          </Field>

          <Field label='דוא"ל'>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              className={cn(fieldInputClass, "text-right")}
            />
          </Field>

          <Field label="טלפון">
            <Input
              required
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="050-0000000"
              dir="ltr"
              className={cn(fieldInputClass, "text-right")}
            />
          </Field>

          {collectShipping && (
            <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3.5">
              <h3 className="text-sm font-semibold text-slate-800">
                כתובת מדויקת למשלוח כרטיס תעודה
              </h3>

              <Field label="עיר">
                <Input
                  required
                  value={form.shippingCity}
                  onChange={(e) => set("shippingCity", e.target.value)}
                  placeholder="עיר מגורים"
                  className={fieldInputClass}
                />
              </Field>
              <Field label="רחוב">
                <Input
                  required
                  value={form.shippingStreet}
                  onChange={(e) => set("shippingStreet", e.target.value)}
                  placeholder="שם הרחוב"
                  className={fieldInputClass}
                />
              </Field>
              <Field label="בניין / בית">
                <Input
                  required
                  value={form.shippingHouseNo}
                  onChange={(e) => set("shippingHouseNo", e.target.value)}
                  placeholder="מספר בית"
                  className={fieldInputClass}
                />
              </Field>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  מיקוד למשלוח כרטיס התעודה
                </label>
                <Input
                  required
                  value={form.shippingZip}
                  onChange={(e) => set("shippingZip", e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  className={cn(fieldInputClass, "text-right")}
                  placeholder="0000000"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  קישור למציאת המיקוד:{" "}
                  <a
                    href={ZIP_HELPER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-sky-700 underline underline-offset-2"
                  >
                    דוואר ישראל
                    <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
            </div>
          )}
        </FormSection>

        {/* —— 2. משוב ושביעות רצון —— */}
        <FormSection
          icon={<MessageSquareHeart className="size-4" />}
          title="משוב ושביעות רצון"
          tone="indigo"
        >
          <Field label="שביעות רצון מההדרכה">
            <div className="grid grid-cols-2 gap-2">
              {SATISFACTION_OPTIONS.map((opt) => (
                <ChoiceCard
                  key={opt}
                  name="satisfaction"
                  value={opt}
                  checked={form.satisfaction === opt}
                  onChange={() => set("satisfaction", opt)}
                  required
                >
                  {opt}
                </ChoiceCard>
              ))}
            </div>
          </Field>

          <Field label="משוב על ההדרכה">
            <Textarea
              value={form.feedback}
              onChange={(e) => set("feedback", e.target.value)}
              placeholder="כתבו כאן משוב חופשי (אופציונלי)"
              rows={3}
              className="min-h-[88px] rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-sky-400 focus-visible:ring-sky-200/60"
            />
          </Field>
        </FormSection>

        {/* —— 3. הצעות נוספות / ציוד —— */}
        <FormSection
          icon={<Package className="size-4" />}
          title="הצעות נוספות / ציוד"
          tone="emerald"
        >
          <Field label="התעניינות ברכישת תיק עזרה ראשונה">
            <div className="flex flex-col gap-2 sm:flex-row">
              {KIT_INTEREST_OPTIONS.map((opt) => (
                <ChoiceCard
                  key={opt}
                  name="kitInterest"
                  value={opt}
                  checked={form.kitInterest === opt}
                  onChange={() => set("kitInterest", opt)}
                  required
                  className="sm:flex-1"
                >
                  {opt === "כן, אשמח שתחזרו אליי" ? (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <HeartHandshake className="size-3.5 shrink-0" />
                      {opt}
                    </span>
                  ) : (
                    opt
                  )}
                </ChoiceCard>
              ))}
            </div>
          </Field>
        </FormSection>

        <Button
          type="submit"
          disabled={saving}
          className="h-12 w-full rounded-2xl bg-sky-600 text-base font-bold text-white hover:bg-sky-700"
        >
          {saving ? "שולח…" : "שליחת הטופס"}
        </Button>
      </form>
    </div>
  )
}

function FormSection({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone: "sky" | "indigo" | "emerald"
  children: React.ReactNode
}) {
  const tones = {
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
            tones[tone],
          )}
        >
          {icon}
        </span>
        <h2 className="text-sm font-bold text-slate-800 md:text-base">
          {title}
        </h2>
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
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
      <label className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
    </div>
  )
}

function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  required,
  children,
  className,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-3 text-center text-sm transition-all",
        checked
          ? "border-sky-500 bg-sky-50 font-bold text-sky-800 shadow-sm"
          : "border-slate-200 bg-slate-50/80 font-medium text-slate-700 hover:border-slate-300 hover:bg-white",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        required={required}
        className="sr-only"
      />
      {children}
    </label>
  )
}
