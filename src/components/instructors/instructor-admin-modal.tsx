"use client"

import { useEffect, useState } from "react"
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
import {
  upsertInstructorAdmin,
  type InstructorAdminRow,
} from "@/lib/instructor-actions"

export function InstructorAdminModal({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: InstructorAdminRow | null
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [fee, setFee] = useState("")
  const [phone, setPhone] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [commission, setCommission] = useState("0")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? "")
    setFee(existing ? String(existing.fee) : "0")
    setPhone(existing?.phone ?? "")
    setUsername(existing?.username ?? "")
    setPassword(existing?.password ?? "")
    setCommission(
      existing ? String(existing.salesCommissionPercentage) : "0",
    )
  }, [open, existing])

  const submit = async () => {
    setBusy(true)
    const res = await upsertInstructorAdmin({
      id: existing?.id,
      name,
      fee: Number(fee) || 0,
      phone,
      username,
      password,
      salesCommissionPercentage: Number(commission) || 0,
      active: existing?.active !== false,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(existing ? "המדריך עודכן" : "מדריך נוסף")
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {existing ? "עריכת מדריך" : "מדריך חדש"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="שם מדריך" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="תעריף הדרכה (₪)">
            <Input
              type="number"
              min={0}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field label="טלפון (ל-WhatsApp)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              dir="ltr"
            />
          </Field>
          <Field label="שם משתמש" required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              dir="ltr"
              autoComplete="off"
            />
          </Field>
          <Field label="סיסמה" required>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
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
              "שמירה"
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
