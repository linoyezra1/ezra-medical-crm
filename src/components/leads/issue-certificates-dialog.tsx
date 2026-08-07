"use client"

import { useState } from "react"
import { ScrollText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { triggerRemoteCertificates } from "@/lib/actions"
import {
  CERTIFICATE_TEMPLATE_TYPES,
  type CertificateTemplateType,
} from "@/lib/certificate-issuance"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  participantIds: string[]
}

export function IssueCertificatesDialog({
  open,
  onOpenChange,
  leadId,
  participantIds,
}: Props) {
  const [templateType, setTemplateType] =
    useState<CertificateTemplateType>("REGULAR")
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!participantIds.length) {
      toast.error("יש לבחור לפחות משתתף אחד")
      return
    }
    setBusy(true)
    const res = await triggerRemoteCertificates({
      leadId,
      participantIds,
      templateType,
      pin,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      res.data.message ||
        "הבקשה נשלחה ל-Google Sheets! התעודות מופקות ונשלחות במייל ברקע.",
    )
    setPin("")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScrollText className="size-5 text-primary" />
            הפקת תעודות מרחוק
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-right">
          <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            {participantIds.length} משתתפים מסומנים
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">סוג תעודה</Label>
            <div className="grid gap-2">
              {CERTIFICATE_TEMPLATE_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={busy}
                  onClick={() => setTemplateType(opt.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                    templateType === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:bg-secondary/50",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cert-pin" className="text-xs text-muted-foreground">
              קוד אישור (אבטחה)
            </Label>
            <Input
              id="cert-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              className="text-left tracking-widest"
              placeholder="הזינו קוד אישי"
              value={pin}
              disabled={busy}
              onChange={(e) => setPin(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit()
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            className="h-11 flex-1 gap-2 rounded-xl font-bold"
            disabled={busy || !pin}
            onClick={() => void submit()}
          >
            <ScrollText className="size-4" />
            {busy ? "שולח…" : "הנפק ושלח תעודות"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
