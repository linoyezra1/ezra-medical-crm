"use client"

import { useState } from "react"
import { AlertTriangle, ChevronLeft, Plus, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { LeadPaymentDialog } from "@/components/leads/lead-payment-dialog"
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
  downloadLeadIcs,
  findConflicts,
  formatDate,
  missingForClose,
  requiresPhysicalAddress,
} from "@/lib/helpers"
import { isLeadPaid, leadCalendarSessions } from "@/lib/payment"
import { useApp } from "@/lib/store"
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_ORDER,
  type Lead,
  type LeadStatus,
} from "@/lib/types"
import { cn } from "@/lib/utils"

/** רקע כפתור «קדם ל» לפי הסטטוס היעד */
function advanceButtonClass(target: LeadStatus): string {
  switch (target) {
    case "new":
      return "bg-amber-400 text-amber-950 hover:bg-amber-500"
    case "closed":
      return "bg-orange-500 text-white hover:bg-orange-600"
    case "pending_certificates":
      return "bg-emerald-600 text-white hover:bg-emerald-700"
    case "completed":
      return "bg-slate-500 text-white hover:bg-slate-600"
    default:
      return ""
  }
}

export function LifecycleControls({
  lead,
  hideParticipantsManage = false,
}: {
  lead: Lead
  /** בטאב ראשי — ניהול משתתפים עובר לטאב ייעודי */
  hideParticipantsManage?: boolean
}) {
  const { updateLead, leads } = useApp()
  const [conflictOpen, setConflictOpen] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [confirmRegress, setConfirmRegress] = useState<LeadStatus | null>(null)
  const [googleCalOpen, setGoogleCalOpen] = useState(false)
  const [paymentBlockOpen, setPaymentBlockOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [lostConfirmOpen, setLostConfirmOpen] = useState(false)

  const currentIdx = LEAD_STATUS_ORDER.indexOf(lead.status)
  const nextStatus =
    currentIdx >= 0 && currentIdx < LEAD_STATUS_ORDER.length - 1
      ? LEAD_STATUS_ORDER[currentIdx + 1]
      : null

  const conflicts = findConflicts(leads, lead.date ?? "", lead.time ?? "", lead.id)

  const commitClose = (bypassConflict = false) => {
    updateLead(lead.id, {
      status: "closed",
      ...(bypassConflict ? { conflictBypass: true } : {}),
    } as Partial<Lead>)
    toast.success("ההדרכה נסגרה / אושרה")
    setGoogleCalOpen(true)
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

    // מעבר ל"הדרכה בוצעה וממתינה לתעודות"
    if (target === "pending_certificates") {
      updateLead(lead.id, { status: "pending_certificates" })
      toast.success("ההדרכה סומנה כבוצעה וממתינה לתעודות")
      return
    }

    if (target === "completed") {
      if (!isLeadPaid(lead)) {
        setPaymentBlockOpen(true)
        return
      }
      updateLead(lead.id, { status: "completed" })
      toast.success("ההדרכה הושלמה ותאריך סגירה נרשם")
      return
    }

    updateLead(lead.id, { status: target })
  }

  const markLost = () => {
    setLostConfirmOpen(true)
  }

  const confirmMarkLost = () => {
    updateLead(lead.id, { status: "lost" })
    setLostConfirmOpen(false)
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

      {/* מחוון שלבים ממוספר */}
      <div className="grid grid-cols-4 gap-1">
        {LEAD_STATUS_ORDER.map((s, i) => {
          const active = i <= currentIdx && lead.status !== "lost"
          const current = s === lead.status
          return (
            <div
              key={s}
              className={
                "flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-center " +
                (current
                  ? "bg-primary/15 ring-1 ring-primary/40"
                  : active
                    ? "bg-primary/5"
                    : "bg-secondary/40")
              }
            >
              <span
                className={
                  "flex size-6 items-center justify-center rounded-full text-[10px] font-bold " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-border text-muted-foreground")
                }
              >
                {i + 1}
              </span>
              <p
                className={
                  "text-[9px] leading-tight " +
                  (current
                    ? "font-bold text-primary"
                    : "font-medium text-muted-foreground")
                }
              >
                שלב {i + 1}: {LEAD_STATUS_LABELS[s]}
              </p>
            </div>
          )
        })}
      </div>
      {lead.status === "lost" ? (
        <p className="text-xs font-medium text-destructive">
          סטטוס נוכחי: {LEAD_STATUS_LABELS.lost}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          שלב נוכחי: שלב {currentIdx + 1} — {LEAD_STATUS_LABELS[lead.status]}
        </p>
      )}

      {lead.status === "lost" ? (
        <Button variant="outline" onClick={() => advance("new")}>
          שחזר ליד מהארכיון
        </Button>
      ) : (
        <>
          {!hideParticipantsManage &&
          lead.status === "pending_certificates" ? (
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
              className={cn(
                "justify-between rounded-xl py-6 border-0",
                advanceButtonClass(nextStatus),
              )}
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
                commitClose(true)
              }}
            >
              אשר בכל זאת ושמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* הוספה ליומן המכשיר (.ics) */}
      <Dialog open={googleCalOpen} onOpenChange={setGoogleCalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">הוסף ליומן</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            האם להוסיף את ההדרכה ליומן במכשיר?
          </p>
          <p className="text-xs text-muted-foreground">
            ייפתח קובץ יומן (.ics) עם אירוע נפרד לכל מפגש — באייפון/אנדרואיד
            אפשר לשמור ישירות ביומן המכשיר.
          </p>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setGoogleCalOpen(false)}
            >
              לא עכשיו
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                const n = leadCalendarSessions(lead).length
                downloadLeadIcs(lead)
                setGoogleCalOpen(false)
                toast.success(
                  n > 1
                    ? `קובץ היומן כולל ${n} מפגשים — שמרו ביומן`
                    : "קובץ היומן נפתח — שמרו את האירוע ביומן",
                )
              }}
            >
              כן, הוסף ליומן
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

      <Dialog open={paymentBlockOpen} onOpenChange={setPaymentBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">לא בוצע תשלום</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            לא ניתן להעביר את ההדרכה לסטטוס ״הסתיים״ לפני שנרשם תשלום. יש להוסיף
            או לעדכן תשלום תחילה.
          </p>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setPaymentBlockOpen(false)}
            >
              ביטול
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setPaymentBlockOpen(false)
                setPaymentDialogOpen(true)
              }}
            >
              הוספת / עדכון תשלום
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadPaymentDialog
        lead={lead}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
      />

      <Dialog open={lostConfirmOpen} onOpenChange={setLostConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-right">סמן כאבוד</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            האם אתה בטוח שברצונך לאבד את הליד?
          </p>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLostConfirmOpen(false)}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={confirmMarkLost}
            >
              כן, סמן כאבוד
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
