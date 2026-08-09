"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { uid } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

export function ParticipantsDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { updateLead } = useApp()
  const [name, setName] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")

  const add = () => {
    const n = name.trim()
    const id = idNumber.trim()
    const ph = phone.trim()
    const em = email.trim()
    if (!n && !id && !ph && !em) {
      toast.error("יש למלא לפחות שדה אחד")
      return
    }
    updateLead(lead.id, {
      participants: [
        ...lead.participants,
        {
          id: uid("p"),
          name: n,
          idNumber: id,
          phone: ph || undefined,
          email: em || undefined,
        },
      ],
    })
    setName("")
    setIdNumber("")
    setPhone("")
    setEmail("")
  }

  const remove = (id: string) => {
    updateLead(lead.id, {
      participants: lead.participants.filter((p) => p.id !== id),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            הזנת משתתפים ({lead.participants.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {lead.participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {p.name || p.phone || p.idNumber || "ללא פרטים"}
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {[p.idNumber, p.phone, p.email].filter(Boolean).join(" · ") ||
                    "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="מחק"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {lead.participants.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              עדיין לא הוזנו משתתפים
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">
            כל השדות אופציונליים — מספיק למלא שדה אחד
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                שם (אופציונלי)
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם מלא"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                ת״ז (אופציונלי)
              </label>
              <Input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="000000000"
                inputMode="numeric"
                dir="ltr"
                className="text-right"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                טלפון (אופציונלי)
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-0000000"
                type="tel"
                dir="ltr"
                className="text-right"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                אימייל (אופציונלי)
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>
          <Button className="w-full gap-2" onClick={add}>
            <Plus className="size-4" />
            הוסף משתתף
          </Button>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            סיום
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
