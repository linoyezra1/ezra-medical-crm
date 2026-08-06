"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, MoreVertical, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLongPress } from "@/hooks/use-long-press"
import { duplicateLead, rollbackLeadStatus } from "@/lib/actions"
import { useApp } from "@/lib/store"
import {
  LEAD_STATUS_LABELS,
  canRollbackLeadStatus,
  previousLeadStatus,
  type Lead,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  lead: Lead
  /** כפתור ... (ברירת מחדל true) */
  showKebab?: boolean
  /** בדסקטופ בלבד (ברירת מחדל true) — false לטבלאות שכבר מוסתרות במובייל */
  kebabDesktopOnly?: boolean
  className?: string
}

/**
 * תפריט שכפול / החזרת סטטוס — kebab בדסקטופ + Action Sheet בלחיצה ארוכה.
 * מחזיר bind ללחיצה ארוכה לשימוש על הכרטיס/שורה.
 */
export function useLeadItemActions(lead: Lead) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { refresh } = useApp()
  const canRollback = canRollbackLeadStatus(lead.status)
  const prev = previousLeadStatus(lead.status)

  const { bind, consumeLongPress } = useLongPress(() => {
    setMenuOpen(false)
    setSheetOpen(true)
  })

  const runDuplicate = async () => {
    setBusy(true)
    const res = await duplicateLead(lead.id)
    setBusy(false)
    setSheetOpen(false)
    setMenuOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("נוצר עותק של הרשומה")
    refresh()
    router.push(`/leads/${res.data.id}`)
  }

  const runRollback = async () => {
    if (!canRollback) return
    setBusy(true)
    const res = await rollbackLeadStatus(lead.id)
    setBusy(false)
    setSheetOpen(false)
    setMenuOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const label = prev ? LEAD_STATUS_LABELS[prev] : ""
    toast.success(label ? `הסטטוס הוחזר ל־${label}` : "הסטטוס הוחזר אחורה")
    refresh()
  }

  return {
    bind,
    consumeLongPress,
    sheetOpen,
    setSheetOpen,
    menuOpen,
    setMenuOpen,
    busy,
    canRollback,
    prev,
    runDuplicate,
    runRollback,
  }
}

export function LeadItemActionsUi({
  lead,
  showKebab = true,
  kebabDesktopOnly = true,
  className,
  state,
}: Props & {
  state: ReturnType<typeof useLeadItemActions>
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state.menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        state.setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [state.menuOpen, state.setMenuOpen])

  const rollbackHint = state.prev
    ? `חזרה ל־${LEAD_STATUS_LABELS[state.prev]}`
    : "אין סטטוס קודם"

  return (
    <>
      {showKebab ? (
        <div
          ref={menuRef}
          className={cn(
            "relative",
            kebabDesktopOnly && "hidden md:block",
            className,
          )}
        >
          <button
            type="button"
            aria-label="אפשרויות נוספות"
            aria-expanded={state.menuOpen}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              state.setMenuOpen((v) => !v)
            }}
          >
            <MoreVertical className="size-4" />
          </button>
          {state.menuOpen ? (
            <div
              role="menu"
              className="absolute start-0 top-full z-40 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover py-1 text-sm shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                disabled={state.busy}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-right hover:bg-secondary disabled:opacity-50"
                onClick={() => void state.runDuplicate()}
              >
                <Copy className="size-4 shrink-0" />
                📋 שכפול
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={state.busy || !state.canRollback}
                title={rollbackHint}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-right hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void state.runRollback()}
              >
                <Undo2 className="size-4 shrink-0" />
                ↩️ החזרת סטטוס אחורה
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={state.sheetOpen} onOpenChange={state.setSheetOpen}>
        <DialogContent
          showCloseButton
          className="top-auto bottom-0 left-1/2 max-w-lg translate-y-0 rounded-t-2xl rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:translate-y-[-50%] sm:rounded-xl"
        >
          <DialogHeader className="border-b border-border px-4 py-3 text-right">
            <DialogTitle className="text-base">
              אפשרויות · {lead.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              disabled={state.busy}
              className="h-12 justify-start gap-3 rounded-xl text-base"
              onClick={() => void state.runDuplicate()}
            >
              <Copy className="size-5" />
              📋 שכפול
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={state.busy || !state.canRollback}
              className="h-12 justify-start gap-3 rounded-xl text-base disabled:opacity-40"
              onClick={() => void state.runRollback()}
            >
              <Undo2 className="size-5" />
              <span className="flex flex-col items-start gap-0.5">
                <span>↩️ החזרת סטטוס אחורה</span>
                {state.canRollback && state.prev ? (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    ל־{LEAD_STATUS_LABELS[state.prev]}
                  </span>
                ) : (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    לא זמין בסטטוס הנוכחי
                  </span>
                )}
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** עטיפה נוחה: kebab + sheet + bind ללחיצה ארוכה */
export function LeadItemActions(props: Props) {
  const state = useLeadItemActions(props.lead)
  return <LeadItemActionsUi {...props} state={state} />
}
