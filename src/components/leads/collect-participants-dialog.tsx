"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Check, Copy, Link2, MessageCircle, QrCode, Star } from "lucide-react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

type Option = "qr_form" | "copy_link" | "qr_site"

type Props = {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CollectParticipantsDialog({ lead, open, onOpenChange }: Props) {
  const { updateLead, settings } = useApp()
  const [step, setStep] = useState<"choose" | "detail">("choose")
  const [option, setOption] = useState<Option | null>(null)
  const [collectShipping, setCollectShipping] = useState(
    Boolean(lead.collectCertificateShipping),
  )
  const [formQr, setFormQr] = useState("")
  const [siteQr, setSiteQr] = useState("")
  const [copied, setCopied] = useState(false)

  const formUrl = useMemo(() => {
    if (typeof window === "undefined") return `/p/${lead.id}`
    return `${window.location.origin}/p/${lead.id}`
  }, [lead.id])

  const websiteUrl = (
    settings.websiteUrl ||
    "https://www.ezra-medical.com/%D7%9B%D7%A0%D7%99%D7%A1%D7%94-%D7%9C%D7%AA%D7%9C%D7%9E%D7%99%D7%93%D7%99%D7%9D"
  ).trim()

  const googleReviewUrl = (settings.googleReviewUrl || "").trim()
  const facebookUrl = (settings.facebookUrl || "").trim()

  const registrationWhatsAppText = () => {
    const reviewLine = googleReviewUrl
      ? `נשמח אם תוכל לדרג אותנו בגוגל בקישור הבא: ${googleReviewUrl}`
      : "נשמח אם תוכל לדרג אותנו בגוגל."
    return `שלום וברכה,\n${reviewLine}\n\nקישור לרישום משתתפים להדרכה: ${formUrl}`
  }

  const sendRegistrationWhatsApp = () => {
    const text = registrationWhatsAppText()
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  useEffect(() => {
    if (!open) {
      setStep("choose")
      setOption(null)
      setCopied(false)
      return
    }
    setCollectShipping(Boolean(lead.collectCertificateShipping))
  }, [open, lead.collectCertificateShipping])

  useEffect(() => {
    if (!open || step !== "detail") return
    let cancelled = false
    ;(async () => {
      if (option === "qr_form") {
        try {
          const dataUrl = await QRCode.toDataURL(formUrl, {
            width: 260,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          })
          if (!cancelled) setFormQr(dataUrl)
        } catch {
          if (!cancelled) setFormQr("")
        }
      }
      if (option === "qr_site" && websiteUrl) {
        try {
          const dataUrl = await QRCode.toDataURL(websiteUrl, {
            width: 260,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          })
          if (!cancelled) setSiteQr(dataUrl)
        } catch {
          if (!cancelled) setSiteQr("")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, step, option, formUrl, websiteUrl])

  const onToggleShipping = (next: boolean) => {
    setCollectShipping(next)
    updateLead(lead.id, { collectCertificateShipping: next })
    toast.success(next ? "יאוספו כתובת ומיקוד בטופס" : "לא יאוספו פרטי משלוח")
  }

  const choose = (next: Option) => {
    setOption(next)
    setStep("detail")
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(formUrl)
      setCopied(true)
      toast.success("הקישור הועתק")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("לא ניתן להעתיק")
    }
  }

  const title =
    step === "choose"
      ? "הוסף משתתפים"
      : option === "qr_form"
        ? "QR לסריקה"
        : option === "copy_link"
          ? "העתק קישור"
          : "QR לאתר"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex min-h-8 items-center gap-2 pe-1">
            {step === "detail" && (
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"
                aria-label="חזרה"
              >
                <ArrowRight className="size-4" />
              </button>
            )}
            <span className="min-w-0 flex-1 truncate text-right">{title}</span>
          </DialogTitle>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
              <div className="min-w-0 text-right">
                <p className="text-sm font-semibold leading-snug">
                  האם לאסוף כתובת ומיקוד למשלוח כרטיס תעודה?
                </p>
              </div>
              <Switch
                checked={collectShipping}
                onCheckedChange={onToggleShipping}
              />
            </div>

            <p className="text-xs text-muted-foreground">בחרו אפשרות אחת:</p>

            <OptionButton
              icon={QrCode}
              title="QR לסריקה"
              desc="קוד לסריקה לטופס ההרשמה"
              onClick={() => choose("qr_form")}
            />
            <OptionButton
              icon={Link2}
              title="העתק קישור"
              desc="העתקת קישור ישיר לטופס"
              onClick={() => choose("copy_link")}
            />
            <OptionButton
              icon={QrCode}
              title="QR לאתר"
              desc="קוד לסריקה לדף כניסה לתלמידים"
              onClick={() => choose("qr_site")}
            />
          </div>
        )}

        {step === "detail" && option === "qr_form" && (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              סרקו כדי לפתוח את טופס המשתתפים
            </p>
            <div className="flex justify-center rounded-2xl bg-white p-4">
              {formQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formQr} alt="QR לטופס משתתפים" className="size-56" />
              ) : (
                <div className="flex size-56 items-center justify-center text-xs text-muted-foreground">
                  טוען QR…
                </div>
              )}
            </div>
          </div>
        )}

        {step === "detail" && option === "copy_link" && (
          <div className="space-y-3">
            <p
              className="break-all rounded-xl bg-secondary/50 px-3 py-3 text-xs text-muted-foreground"
              dir="ltr"
            >
              {formUrl}
            </p>
            <Button className="h-12 w-full gap-2 rounded-xl text-base" onClick={copyLink}>
              {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
              {copied ? "הועתק!" : "העתק קישור"}
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full gap-2 rounded-xl text-base"
              onClick={sendRegistrationWhatsApp}
            >
              <MessageCircle className="size-5" />
              שלח בווצאפ קישור לרישום
            </Button>
            <div className="flex items-center justify-center gap-3 pt-1">
              {googleReviewUrl && (
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                  title="דירוג בגוגל"
                  aria-label="דירוג בגוגל"
                >
                  <Star className="size-5 fill-current" />
                </a>
              )}
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-11 items-center justify-center rounded-full bg-blue-100 text-blue-700"
                  title="פייסבוק"
                  aria-label="פייסבוק"
                >
                  <span className="text-sm font-bold">f</span>
                </a>
              )}
            </div>
          </div>
        )}

        {step === "detail" && option === "qr_site" && (
          <div className="space-y-3">
            <p className="break-all text-center text-xs text-muted-foreground" dir="ltr">
              {websiteUrl}
            </p>
            <div className="flex justify-center rounded-2xl bg-white p-4">
              {siteQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={siteQr} alt="QR לאתר" className="size-56" />
              ) : (
                <div className="flex size-56 items-center justify-center text-xs text-muted-foreground">
                  טוען QR…
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OptionButton({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ElementType
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-secondary/30 p-3 text-right transition-colors active:scale-[0.99] hover:bg-secondary/50"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </button>
  )
}
