"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  fetchInventoryCatalogForInstructors,
  upsertInstructorAdmin,
  type InstructorAdminRow,
  type InventoryCatalogItem,
} from "@/lib/instructor-actions"
import { formatCurrency } from "@/lib/helpers"
import { cn } from "@/lib/utils"

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
  const [allowedIds, setAllowedIds] = useState<string[]>([])
  const [catalog, setCatalog] = useState<InventoryCatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
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
    setAllowedIds(existing?.allowedEquipmentIds ?? [])

    setCatalogLoading(true)
    void fetchInventoryCatalogForInstructors().then((res) => {
      setCatalogLoading(false)
      if (!res.ok) {
        toast.error(res.error)
        setCatalog([])
        return
      }
      setCatalog(res.data)
    })
  }, [open, existing])

  const toggleAllowed = (id: string, checked: boolean) => {
    setAllowedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }

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
      allowedEquipmentIds: allowedIds,
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

          <div className="space-y-2">
            <Label>מוצרים זמינים למדריך למכירה</Label>
            <p className="text-[11px] text-muted-foreground">
              רק הפריטים המסומנים יופיעו באזור האישי בדיווח מכירה
            </p>
            <div
              className={cn(
                "max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-secondary/20 p-2",
              )}
            >
              {catalogLoading ? (
                <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  טוען מלאי…
                </p>
              ) : catalog.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  אין פריטי מלאי במערכת
                </p>
              ) : (
                catalog.map((item) => {
                  const checked = allowedIds.includes(item.id)
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary/60"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          toggleAllowed(item.id, v === true)
                        }
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {item.name}
                      </span>
                      <span
                        className="shrink-0 text-xs tabular-nums text-muted-foreground"
                        dir="ltr"
                      >
                        {formatCurrency(item.sellingPrice)}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
            {allowedIds.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                נבחרו {allowedIds.length} מוצרים
              </p>
            ) : null}
          </div>

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
