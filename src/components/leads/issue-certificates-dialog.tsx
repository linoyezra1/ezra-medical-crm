"use client"

import { useState } from "react"
import { FlaskConical, ScrollText } from "lucide-react"
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
import { generatePilotCertificatesAction } from "@/lib/certificate-pdf-pilot-actions"
import {
  CERTIFICATE_TEMPLATE_TYPES,
  type CertificateTemplateType,
} from "@/lib/certificate-issuance"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** אופציונלי — ממסך הדרכה; ממסך מודרכים אפשר להשאיר ריק */
  leadId?: string
  participantIds: string[]
}

function downloadBase64Pdf(base64: string, fileName: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
  const [busy, setBusy] = useState<"remote" | "pilot" | null>(null)

  const submitRemote = async () => {
    if (!participantIds.length) {
      toast.error("יש לבחור לפחות משתתף אחד")
      return
    }
    setBusy("remote")
    const res = await triggerRemoteCertificates({
      leadId: leadId || undefined,
      participantIds,
      templateType,
      pin,
    })
    setBusy(null)
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

  const submitPilot = async () => {
    if (!participantIds.length) {
      toast.error("יש לבחור לפחות משתתף אחד")
      return
    }
    if (!pin) {
      toast.error("יש להזין קוד אישור")
      return
    }
    setBusy("pilot")
    const res = await generatePilotCertificatesAction({
      leadId: leadId || undefined,
      participantIds,
      pin,
    })
    setBusy(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    downloadBase64Pdf(res.data.pdfBase64, res.data.fileName)
    toast.success(
      res.data.count === 1
        ? "תעודת הפיילוט הורדה (ללא שליחת מייל)"
        : `${res.data.count} תעודות פיילוט הורדו (ללא שליחת מייל)`,
    )
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
                  disabled={Boolean(busy)}
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
            <p className="text-[11px] text-muted-foreground">
              הפיילוט משתמש כרגע בתבנית הרגילה בלבד (ללא מייל).
            </p>
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
              disabled={Boolean(busy)}
              onChange={(e) => setPin(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitRemote()
              }}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:justify-start">
          <Button
            type="button"
            className="h-11 w-full gap-2 rounded-xl font-bold"
            disabled={Boolean(busy) || !pin}
            onClick={() => void submitRemote()}
          >
            <ScrollText className="size-4" />
            {busy === "remote" ? "שולח…" : "הנפק ושלח תעודות"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 w-full gap-2 rounded-xl font-bold"
            disabled={Boolean(busy) || !pin}
            onClick={() => void submitPilot()}
          >
            <FlaskConical className="size-4" />
            {busy === "pilot" ? "מפיק PDF…" : "הפקת תעודה פיילוט"}
          </Button>
          <p className="w-full text-center text-[11px] text-muted-foreground">
            פיילוט — מוריד PDF במקום · ללא שליחת מייל
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl"
            disabled={Boolean(busy)}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
