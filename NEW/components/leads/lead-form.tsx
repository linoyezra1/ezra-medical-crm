"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Check } from "lucide-react"
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
import { CATEGORIES, INSTRUCTORS } from "@/lib/demo-data"
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

export function LeadForm({ existing }: Props) {
  const router = useRouter()
  const { addLead, updateLead, settings, findClientByPhone, clients, leads } =
    useApp()

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
      courseType: settings.courses[0]?.type ?? "",
      courseHours: settings.courses[0]?.hours,
      category: CATEGORIES[0],
      pricingType: "per_participant",
      pricePerUnit: 0,
      participantsCount: 1,
      totalPrice: 0,
      certificateDelivery: "digital",
      address: { street: "", houseNumber: "", city: "", zip: "" },
      participants: [],
      expenses: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
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

  // Auto-save simulation (draft) — flashes indicator so field data isn't "lost"
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

  const selectedCourse = settings.courses.find((c) => c.type === form.courseType)

  const validate = () => {
    const e: Record<string, boolean> = {}
    if (!form.name.trim()) e.name = true
    if (!form.phone.trim()) e.phone = true
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = () => {
    if (!validate()) {
      toast.error("יש למלא שם וטלפון")
      return
    }
    const payload: Lead = {
      ...form,
      phone: cleanPhone(form.phone),
      totalPrice: total,
      courseHours: selectedCourse?.hours,
    }
    if (existing) {
      updateLead(existing.id, payload)
      toast.success("הליד עודכן")
      router.push(`/leads/${existing.id}`)
    } else {
      addLead(payload)
      toast.success("ליד חדש נוצר")
      router.push(`/leads/${payload.id}`)
    }
  }

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

      <div className="p-4">
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

        <Tabs defaultValue="details" dir="rtl">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">פרטים</TabsTrigger>
            <TabsTrigger value="course">קורס ותמחור</TabsTrigger>
            <TabsTrigger value="logistics">לוגיסטיקה</TabsTrigger>
          </TabsList>

          {/* פרטים */}
          <TabsContent value="details" className="mt-4 space-y-4">
            <Field label="שם הלקוח / הארגון" error={errors.name} required>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="לדוגמה: גן שמש"
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

          {/* קורס ותמחור */}
          <TabsContent value="course" className="mt-4 space-y-4">
            <Field label="סוג קורס">
              <Select
                value={form.courseType}
                onValueChange={(v) => set("courseType", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.courses.map((c) => (
                    <SelectItem key={c.type} value={c.type}>
                      {c.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="קטגוריה">
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.category === "אחר" && (
              <Field label="פירוט קטגוריה" required>
                <Input
                  value={form.categoryOther ?? ""}
                  onChange={(e) => set("categoryOther", e.target.value)}
                  placeholder="הזן קטגוריה"
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="מחיר ליחיד">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.pricePerUnit || ""}
                    onChange={(e) => set("pricePerUnit", Number(e.target.value))}
                  />
                </Field>
                <Field label="מספר משתתפים">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.participantsCount || ""}
                    onChange={(e) =>
                      set("participantsCount", Number(e.target.value))
                    }
                  />
                </Field>
              </div>
            ) : (
              <Field label="מחיר גלובלי">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={globalPrice || ""}
                  onChange={(e) => setGlobalPrice(Number(e.target.value))}
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

          {/* לוגיסטיקה */}
          <TabsContent value="logistics" className="mt-4 space-y-4">
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

            <Field label="מדריך">
              <Select
                value={form.instructor ?? ""}
                onValueChange={(v) => set("instructor", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר מדריך" />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUCTORS.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="אופן אספקת תעודות">
              <Select
                value={form.certificateDelivery}
                onValueChange={(v) =>
                  set("certificateDelivery", (v ?? "digital") as Lead["certificateDelivery"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">דיגיטלי</SelectItem>
                  <SelectItem value="mail">דואר</SelectItem>
                  <SelectItem value="physical">כרטיסים פיזיים</SelectItem>
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

            {form.category === "גני ילדים" && (
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

            <Field label="הערות">
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="הערות פנימיות"
              />
            </Field>
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
