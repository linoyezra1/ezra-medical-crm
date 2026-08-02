"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Link2, QrCode } from "lucide-react"
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

type Props = {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CollectParticipantsDialog({ lead, open, onOpenChange }: Props) {
  const { updateLead, settings } = useApp()
  const [collectShipping, setCollectShipping] = useState(
    Boolean(lead.collectCertificateShipping),
  )
  const [formQr, setFormQr] = useState<string>("")
  const [siteQr, setSiteQr] = useState<string>("")
  const [copied, setCopied] = useState(false)

  const formUrl = useMemo(() => {
    if (typeof window === "undefined") return `/p/${lead.id}`
    return `${window.location.origin}/p/${lead.id}`
  }, [lead.id])

  const websiteUrl = (settings.websiteUrl || "").trim()

  useEffect(() => {
    if (!open) return
    setCollectShipping(Boolean(lead.collectCertificateShipping))
  }, [open, lead.collectCertificateShipping])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const dataUrl = await QRCode.toDataURL(formUrl, {
          width: 220,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        })
        if (!cancelled) setFormQr(dataUrl)
      } catch {
        if (!cancelled) setFormQr("")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, formUrl])

  useEffect(() => {
    if (!open || !websiteUrl) {
      setSiteQr("")
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const dataUrl = await QRCode.toDataURL(websiteUrl, {
          width: 220,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        })
        if (!cancelled) setSiteQr(dataUrl)
      } catch {
        if (!cancelled) setSiteQr("")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, websiteUrl])

  const onToggleShipping = (next: boolean) => {
    setCollectShipping(next)
    updateLead(lead.id, { collectCertificateShipping: next })
    toast.success(next ? "יאוספו כתובת ומיקוד בטופס" : "לא יאוספו פרטי משלוח")
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>הוסף משתתפים</DialogTitle>
        </DialogHeader>

        <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
          <div className="min-w-0 text-right">
            <p className="text-sm font-semibold leading-snug">
              האם לאסוף כתובת ומיקוד למשלוח כרטיס תעודה?
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              אם כן — בטופס הציבורי יופיעו שדות כתובת ומיקוד חובה
            </p>
          </div>
          <Switch
            checked={collectShipping}
            onCheckedChange={onToggleShipping}
          />
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <QrCode className="size-4 text-primary" />
              QR לסריקה
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              סריקה מובילה ישירות לטופס ההרשמה של הליד
            </p>
            <div className="flex justify-center rounded-xl bg-white p-3">
              {formQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formQr} alt="QR לטופס משתתפים" className="size-48" />
              ) : (
                <div className="flex size-48 items-center justify-center text-xs text-muted-foreground">
                  טוען QR…
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Link2 className="size-4 text-primary" />
              העתק קישור
            </div>
            <p
              className="mb-3 break-all rounded-xl bg-secondary/50 px-2.5 py-2 text-[11px] text-muted-foreground"
              dir="ltr"
            >
              {formUrl}
            </p>
            <Button className="w-full gap-2 rounded-xl" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "הועתק!" : "העתק קישור"}
            </Button>
          </section>

          <section className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <QrCode className="size-4 text-primary" />
              QR לאתר
            </div>
            {websiteUrl ? (
              <>
                <p className="mb-3 break-all text-xs text-muted-foreground" dir="ltr">
                  {websiteUrl}
                </p>
                <div className="flex justify-center rounded-xl bg-white p-3">
                  {siteQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={siteQr} alt="QR לאתר העסק" className="size-48" />
                  ) : (
                    <div className="flex size-48 items-center justify-center text-xs text-muted-foreground">
                      טוען QR…
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                לא הוגדר אתר עסק. ניתן להגדיר בהגדרות → אתר העסק.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
