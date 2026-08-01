"use client"

import { Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  booklet44Mailto,
  booklet44WhatsAppMessage,
  courseMaterialUrl,
} from "@/lib/course-materials"
import { whatsappLink } from "@/lib/helpers"
import type { Lead } from "@/lib/types"

type Props = {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SendBookletDialog({ lead, open, onOpenChange }: Props) {
  const contactName = lead.contactName?.trim() || lead.name
  const fileUrl = courseMaterialUrl("booklet44Pdf")

  const sendWhatsApp = () => {
    const text = booklet44WhatsAppMessage(contactName, fileUrl)
    window.open(whatsappLink(lead.phone, text), "_blank", "noopener,noreferrer")
    onOpenChange(false)
  }

  const sendEmail = () => {
    const email = lead.email?.trim()
    if (!email) {
      toast.error("לא הוזנה כתובת מייל לליד זה")
      return
    }
    window.location.href = booklet44Mailto({
      email,
      contactName,
      fileUrl,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>שלח חוברת · קורס 44 שעות</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          בחרו איך לשלוח את קישור ההורדה לחוברת ה-PDF.
        </p>
        <div className="space-y-2">
          <Button
            className="h-auto w-full justify-start gap-3 rounded-xl py-3 text-right"
            onClick={sendWhatsApp}
          >
            <MessageCircle className="size-5 shrink-0" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-semibold">ווצאפ</span>
              <span className="text-xs font-normal opacity-90">
                שליחת קישור הורדה בשיחת WhatsApp
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto w-full justify-start gap-3 rounded-xl py-3 text-right"
            onClick={sendEmail}
          >
            <Mail className="size-5 shrink-0" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-semibold">דוא״ל</span>
              <span className="text-xs font-normal text-muted-foreground">
                {lead.email?.trim()
                  ? `שליחה אל ${lead.email}`
                  : "נדרשת כתובת מייל בליד"}
              </span>
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="w-full rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
