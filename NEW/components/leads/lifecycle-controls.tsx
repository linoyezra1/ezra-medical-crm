"use client"

import { useState } from "react"
import { AlertTriangle, ChevronLeft, Plus, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { ParticipantsDialog } from "@/components/leads/participants-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  findConflicts,
  formatDate,
  missingForClose,
  requiresPhysicalAddress,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_ORDER,
  type Lead,
  type LeadStatus,
} from "@/lib/types"

export function LifecycleControls({ lead }: { lead: Lead }) {
  const { updateLead, leads } = useApp()
  const [conflictOpen, setConflictOpen] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [confirmRegress, setConfirmRegress] = useState<LeadStatus | null>(null)

  const currentIdx = LEAD_STATUS_ORDER.indexOf(lead.status)
  const nextStatus =
    currentIdx >= 0 && currentIdx < LEAD_STATUS_ORDER.length - 1
      ? LEAD_STATUS_ORDER[currentIdx + 1]
      : null

  const conflicts = findConflicts(leads, lead.date ?? "", lead.time ?? "", lead.id)

  const commitClose = () => {
    updateLead(lead.id, { status: "closed" })
    toast.success("ההדרכה נסגרה ואירוע נוצר ביומן")
  }

  const advance = (target: LeadStatus) => {
    // מעבר ל"נסגר": דורש תאריך/שעה/כתובת + בדיקת חפיפה
    if (target === "closed") {
      const missing = missingForClose(lead)
      if (missing.length) {
        toast.error(`חסר: ${missing.join(", ")} למעבר ל"נסגר"`)
        return
      }
      if (requiresPhysicalAddress(lead) && !lead.address.houseNumber) {
        toast.error("אספקה בדואר/הדפסה מחייבת רחוב, מספר בית ועיר")
        return
      }
      if (conflicts.length > 0) {
        setConflictOpen(true)
        return
      }
      commitClose()
      return
    }

    // מעבר ל"בוצעה": דורש לפחות משתתף אחד
    if (target === "done") {
      if (lead.participants.length === 0) {
        setParticipantsOpen(true)
        toast.message("יש להזין לפחות משתתף אחד")
        return
      }
      updateLead(lead.id, { status: "done" })
      toast.success("ההדרכה סומנה כבוצעה")
      return
    }

    if (target === "pending_certificates") {
      if (lead.participants.length === 0) {
        toast.error("יש להזין לפחות משתתף אחד")
        setParticipantsOpen(true)
        return
      }
      updateLead(lead.id, { status: "pending_certificates" })
      toast.success("עבר לסטטוס ממתין לתעודות")
      return
    }

    if (target === "completed") {
      updateLead(lead.id, { status: "completed" })
      toast.success("ההדרכה הושלמה ותאריך סגירה נרשם")
      return
    }

    updateLead(lead.id, { status: target })
  }

  const markLost = () => {
    updateLead(lead.id, { status: "lost" })
    toast.success("הליד הועבר לארכיון (אבוד)")
  }

  const regressTo = (target: LeadStatus) => {
    updateLead(lead.id, { status: target })
    toast.success(`הסטטוס שונה ל${LEAD_STATUS_LABELS[target]}`)
    setConfirmRegress(null)
  }

  return (
    <Card className="gap-3 p-4">
      <h2 className="text-sm font-bold">מחזור חיים של הליד</h2>

      {/* מחוון שלבים */}
      <div className="flex items-center gap-1">
        {LEAD_STATUS_ORDER.map((s, i) => (
          <div
            key={s}
            className={
              "h-1.5 flex-1 rounded-full " +
              (i <= currentIdx && lead.status !== "lost"
                ? "bg-primary"
                : "bg-border")
            }
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        שלב נוכחי: {LEAD_STATUS_LABELS[lead.status]}
      </p>

      {lead.status === "lost" ? (
        <Button variant="outline" onClick={() => advance("new")}>
          שחזר ליד מהארכיון
        </Button>
      ) : (
        <>
          {lead.status === "done" || lead.status === "pending_certificates" ? (
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => setParticipantsOpen(true)}
            >
              ניהול משתתפים ({lead.participants.length})
              <Plus className="size-4" />
            </Button>
          ) : null}

          {nextStatus && lead.status !== "completed" && (
            <Button
              className="justify-between rounded-xl py-6"
              onClick={() => advance(nextStatus)}
            >
              קדם ל: {LEAD_STATUS_LABELS[nextStatus]}
              <ChevronLeft className="size-5" />
            </Button>
          )}

          <div className="flex gap-2">
            {lead.status !== "completed" && (
              <Button
                variant="ghost"
                className="flex-1 text-destructive hover:text-destructive"
                onClick={markLost}
              >
                <XCircle className="size-4" />
                סמן כאבוד
              </Button>
            )}
            {lead.status === "completed" && (
              <Button
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={() => setConfirmRegress("closed")}
              >
                <AlertTriangle className="size-4" />
                שינוי רטרואקטיבי
              </Button>
            )}
          </div>
        </>
      )}

      {/* פופאפ חפיפה */}
      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right text-warning-foreground">
              <AlertTriangle className="size-5" />
              זוהתה חפיפה ביומן
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              קיימות הדרכות בטווח שעה מ{formatDate(lead.date)} {lead.time}:
            </p>
            {conflicts.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-warning/40 bg-warning/10 p-2.5"
              >
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.time} · {c.instructor || "ללא מדריך"} · {c.address.city}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConflictOpen(false)}
            >
              ביטול ולא לשמור
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setConflictOpen(false)
                commitClose()
              }}
            >
              אשר בכל זאת ושמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* אישור שינוי רטרואקטיבי */}
      <Dialog
        open={confirmRegress !== null}
        onOpenChange={(o) => !o && setConfirmRegress(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">שינוי רטרואקטיבי</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            הליד כבר בסטטוס "הושלם". שינוי הסטטוס אחורה עלול להשפיע על דוחות
            ותעודות. להמשיך?
          </p>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmRegress(null)}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => confirmRegress && regressTo(confirmRegress)}
            >
              כן, שנה סטטוס
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ParticipantsDialog
        lead={lead}
        open={participantsOpen}
        onOpenChange={setParticipantsOpen}
      />
    </Card>
  )
}
