"use client"

import { useState } from "react"
import { CheckCircle2, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitPublicParticipant } from "@/lib/actions"
import {
  KIT_INTEREST_OPTIONS,
  SATISFACTION_OPTIONS,
} from "@/lib/types"

const ZIP_HELPER_URL = "https://doar.israelpost.co.il/locatezip"

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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-primary/10 via-background to-background px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-9" />
        </div>
        <h1 className="text-xl font-bold text-foreground">
          הטופס נשלח בהצלחה, תודה!
        </h1>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/8 via-background to-background">
      <header className="border-b border-border/60 bg-card/80 px-4 py-5 backdrop-blur">
        <p className="text-xs font-medium text-primary">{businessName}</p>
        <h1 className="mt-1 text-lg font-bold text-foreground">הרשמת משתתף</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{courseLabel}</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 p-4 pb-10">
        <Field label='שם מארגן / מזמין הקורס'>
          <Input
            required
            value={form.organizerName}
            onChange={(e) => set("organizerName", e.target.value)}
            placeholder="שם המארגן"
          />
        </Field>

        <Field label="שם מלא">
          <Input
            required
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="שם מלא של המשתתף"
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
            className="text-right"
          />
        </Field>

        <Field label="תאריך ביצוע הקורס">
          <Input
            required
            type="date"
            value={form.courseDate}
            onChange={(e) => set("courseDate", e.target.value)}
            dir="ltr"
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
            className="text-right"
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
            className="text-right"
          />
        </Field>

        <Field label="שביעות רצון מההדרכה">
          <div className="grid gap-2">
            {SATISFACTION_OPTIONS.map((opt) => (
              <label
                key={opt}
                className={
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors " +
                  (form.satisfaction === opt
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-card")
                }
              >
                <input
                  type="radio"
                  name="satisfaction"
                  value={opt}
                  checked={form.satisfaction === opt}
                  onChange={() => set("satisfaction", opt)}
                  className="accent-primary"
                  required
                />
                {opt}
              </label>
            ))}
          </div>
        </Field>

        <Field label="משוב על ההדרכה">
          <Textarea
            value={form.feedback}
            onChange={(e) => set("feedback", e.target.value)}
            placeholder="כתבו כאן משוב חופשי (אופציונלי)"
            rows={3}
          />
        </Field>

        <Field label="התעניינות ברכישת תיק עזרה ראשונה">
          <div className="grid gap-2">
            {KIT_INTEREST_OPTIONS.map((opt) => (
              <label
                key={opt}
                className={
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors " +
                  (form.kitInterest === opt
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-card")
                }
              >
                <input
                  type="radio"
                  name="kitInterest"
                  value={opt}
                  checked={form.kitInterest === opt}
                  onChange={() => set("kitInterest", opt)}
                  className="accent-primary"
                  required
                />
                {opt}
              </label>
            ))}
          </div>
        </Field>

        {collectShipping && (
          <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
            <h2 className="text-sm font-bold text-foreground">
              כתובת מדויקת למשלוח כרטיס תעודה
            </h2>

            <Field label="עיר">
              <Input
                required
                value={form.shippingCity}
                onChange={(e) => set("shippingCity", e.target.value)}
              />
            </Field>
            <Field label="רחוב">
              <Input
                required
                value={form.shippingStreet}
                onChange={(e) => set("shippingStreet", e.target.value)}
              />
            </Field>
            <Field label="בניין / בית">
              <Input
                required
                value={form.shippingHouseNo}
                onChange={(e) => set("shippingHouseNo", e.target.value)}
              />
            </Field>
            <div className="space-y-1.5">
              <Label>מיקוד למשלוח כרטיס התעודה</Label>
              <Input
                required
                value={form.shippingZip}
                onChange={(e) => set("shippingZip", e.target.value)}
                inputMode="numeric"
                dir="ltr"
                className="text-right"
                placeholder="0000000"
              />
              <p className="text-xs text-muted-foreground">
                קישור למציאת המיקוד שלי:{" "}
                <a
                  href={ZIP_HELPER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                >
                  {ZIP_HELPER_URL}
                  <ExternalLink className="size-3" />
                </a>
              </p>
            </div>
          </section>
        )}

        <Button
          type="submit"
          disabled={saving}
          className="h-12 w-full rounded-2xl text-base font-bold"
        >
          {saving ? "שולח…" : "שליחת הטופס"}
        </Button>
      </form>
    </div>
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
