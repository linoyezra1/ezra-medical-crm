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

  const add = () => {
    if (!name.trim() || !idNumber.trim()) {
      toast.error("יש להזין שם ותעודת זהות")
      return
    }
    updateLead(lead.id, {
      participants: [
        ...lead.participants,
        { id: uid("p"), name: name.trim(), idNumber: idNumber.trim() },
      ],
    })
    setName("")
    setIdNumber("")
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
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {p.idNumber}
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

        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t border-border pt-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">שם</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם מלא"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">ת״ז</label>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="000000000"
              inputMode="numeric"
              dir="ltr"
              className="text-right"
            />
          </div>
          <Button size="icon" onClick={add} aria-label="הוסף משתתף">
            <Plus className="size-5" />
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
