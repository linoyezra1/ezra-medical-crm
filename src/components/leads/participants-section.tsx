"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BadgeCheck,
  CheckCheck,
  FileCheck,
  GraduationCap,
  MessageCircle,
  MoreVertical,
  Pencil,
  Phone,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  UserPlus,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { IssueCertificatesDialog } from "@/components/leads/issue-certificates-dialog"
import { ParticipantPaymentDialog } from "@/components/leads/participant-payment-dialog"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  fetchLeadParticipants,
  ensureCustomCourseTypeOption,
  refreshWixParticipantsAction,
  removeParticipant,
  sendLmsAccessToSheets,
  sendZoomLinkEmailAction,
  setParticipantAttended,
  updateParticipantDetails,
} from "@/lib/actions"
import {
  COURSE_TYPE_FORMAT_ERROR,
  COURSE_TYPE_OTHER,
  collectCourseTypeOptions,
  formatCourseTypeLabel,
  isAllowedCourseTypeValue,
} from "@/lib/course-type"
import {
  collectLeadCategoryOptions,
  formatCurrency,
  formatDate,
  weekdayNameHe,
  whatsappLink,
  zoomInviteWhatsAppMessage,
} from "@/lib/helpers"
import { lmsParticipantWhatsAppMessage } from "@/lib/lms"
import { pickZoomSessionForInvite } from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { Lead, Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

function ExternalTag() {
  return (
    <span className="shrink-0 rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-pink-700">
      חיצוני
    </span>
  )
}

function WixTag() {
  return (
    <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-indigo-700">
      Wix
    </span>
  )
}

/** פרטי התחברות LMS שנשמרו מקומית אחרי יצירה — מוכנים לשליחת מייל בעתיד */
type LmsCredentialMeta = {
  participantId: string
  fullName: string
  email?: string
  username: string
  password: string
  loginUrl?: string
}

/** תפריט פעולות בשורת משתתף — מובייל: Bottom Sheet כדי שלא ייחתך מהמסך */
function ParticipantMobileKebab({
  p,
  lmsBusy,
  onWhatsApp,
  onSendZoom,
  onToggleAttended,
  onCreateLms,
  onEdit,
  onPayment,
  onRemove,
}: {
  p: Participant
  lmsBusy: string | null
  onWhatsApp: () => void
  onSendZoom?: () => void
  onToggleAttended: () => void
  onCreateLms: () => void
  onEdit: () => void
  onPayment: () => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const busy = lmsBusy === p.id

  const run = (fn: () => void) => {
    setOpen(false)
    // defer so sheet closes before dialogs / navigation
    window.setTimeout(fn, 0)
  }

  return (
    <>
      <button
        type="button"
        aria-label="פעולות משתתף"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <MoreVertical className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[min(85dvh,560px)] gap-0 rounded-t-3xl p-0 md:hidden"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-right">
            <SheetTitle className="text-base">
              פעולות · {p.name}
            </SheetTitle>
          </SheetHeader>
          <div className="flex max-h-[min(70dvh,480px)] flex-col gap-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {p.phone?.trim() ? (
              <a
                href={`tel:${p.phone}`}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-secondary"
                onClick={() => setOpen(false)}
              >
                <Phone className="size-5 shrink-0 text-primary" />
                חיוג
              </a>
            ) : null}
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
              onClick={() => run(onWhatsApp)}
            >
              <MessageCircle className="size-5 shrink-0 text-emerald-700" />
              וואטסאפ
            </button>
            {onSendZoom ? (
              <button
                type="button"
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
                onClick={() => run(onSendZoom)}
              >
                <Video className="size-5 shrink-0 text-sky-700" />
                שלח קישור לזום
              </button>
            ) : null}
            {p.certificateUrl?.trim() ? (
              <a
                href={p.certificateUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-secondary"
                onClick={() => setOpen(false)}
              >
                <FileCheck className="size-5 shrink-0 text-amber-500" />
                תעודה
              </a>
            ) : null}
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
              onClick={() => run(onToggleAttended)}
            >
              <CheckCheck
                className={cn(
                  "size-5 shrink-0",
                  p.attended ? "text-emerald-700" : "text-muted-foreground",
                )}
              />
              {p.attended ? "בטל נוכחות" : "סמן נוכחות"}
            </button>
            {!p.hasLmsAccess ? (
              <button
                type="button"
                disabled={Boolean(lmsBusy)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary disabled:opacity-50"
                onClick={() => run(onCreateLms)}
              >
                {busy ? (
                  <RefreshCw className="size-5 shrink-0 animate-spin" />
                ) : (
                  <GraduationCap className="size-5 shrink-0 text-primary" />
                )}
                פתח משתמש בלמידה
              </button>
            ) : null}
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
              onClick={() => run(onEdit)}
            >
              <Pencil className="size-5 shrink-0 text-muted-foreground" />
              עריכה
            </button>
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
              onClick={() => run(onPayment)}
            >
              <ScrollText className="size-5 shrink-0 text-primary" />
              רישום תשלום למשתתף
            </button>
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base text-destructive hover:bg-destructive/10"
              onClick={() => run(onRemove)}
            >
              <Trash2 className="size-5 shrink-0" />
              מחיקה
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function ParticipantsSection({
  lead,
  active = true,
}: {
  lead: Lead
  /** רענון אוטומטי פעם אחת בכל כניסה לטאב */
  active?: boolean
}) {
  const { setLeadParticipants, refresh, settings, leads } = useApp()
  const [polling, setPolling] = useState(false)
  const wasActive = useRef(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lmsBusy, setLmsBusy] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoomDialogParticipant, setZoomDialogParticipant] =
    useState<Participant | null>(null)
  const [lmsCredentials, setLmsCredentials] = useState<
    Record<string, LmsCredentialMeta>
  >({})
  const [editP, setEditP] = useState<Participant | null>(null)
  const [payParticipant, setPayParticipant] = useState<Participant | null>(null)
  const [editForm, setEditForm] = useState({
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    feedback: "",
    isExternal: false,
    courseType: "",
    courseTypeOther: "",
    courseCategory: "",
    agreedPrice: "",
  })
  const [issueOpen, setIssueOpen] = useState(false)

  const participants = lead.participants || []
  const attendedCount = participants.filter((p) => p.attended).length
  const zoomSession = pickZoomSessionForInvite(lead)
  const canSendZoom = Boolean(zoomSession)

  const sendZoomWhatsApp = (p: Participant) => {
    if (!p.phone?.trim()) {
      toast.error("חסר טלפון למשתתף")
      return
    }
    const session = pickZoomSessionForInvite(lead)
    if (!session) {
      toast.error("ההדרכה אינה מוגדרת כמפגש זום")
      return
    }
    const link = session.zoomLink?.trim()
    if (!link) {
      toast.error("יש להזין קישור זום בטופס ההדרכה")
      return
    }
    const text = zoomInviteWhatsAppMessage(p.name, {
      date: session.date,
      time: session.time,
      zoomLink: link,
    })
    window.open(
      whatsappLink(p.phone, text),
      "_blank",
      "noopener,noreferrer",
    )
  }

  const openZoomSend = (p: Participant) => {
    // Case B: אין אימייל למשתתף -> שליחה ישירה בוואטסאפ
    if (!p.email?.trim()) {
      sendZoomWhatsApp(p)
      return
    }
    // Case A: יש אימייל -> פותחים דיאלוג רב ערוצי
    setZoomDialogParticipant(p)
  }

  const zoomDialogOpen = Boolean(zoomDialogParticipant)

  const zoomDialogSession = canSendZoom ? zoomSession : null

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return participants
    return participants.filter(
      (p) =>
        p.name.includes(q) ||
        (p.phone || "").includes(q) ||
        p.idNumber.includes(q) ||
        (p.email || "").includes(q),
    )
  }, [participants, query])

  const courseOptions = useMemo(
    () => collectCourseTypeOptions(leads, settings.courses),
    [leads, settings.courses],
  )

  const categoryOptions = useMemo(
    () => collectLeadCategoryOptions(leads),
    [leads],
  )

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id))
  const selectedPendingLms = filtered.filter(
    (p) => selectedIds.has(p.id) && !p.hasLmsAccess,
  )

  const refreshParticipants = useCallback(async () => {
    try {
      setPolling(true)
      await refreshWixParticipantsAction(lead.id).catch(() => {})
      const rows = await fetchLeadParticipants(lead.id)
      setLeadParticipants(lead.id, rows)
    } catch {
      /* ignore */
    } finally {
      setPolling(false)
    }
  }, [lead.id, setLeadParticipants])

  useEffect(() => {
    if (!active) {
      wasActive.current = false
      return
    }
    if (wasActive.current) return
    wasActive.current = true
    void refreshParticipants()
  }, [active, refreshParticipants])

  const toggleSelected = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(id)
      else copy.delete(id)
      return copy
    })
  }

  const toggleSelectAllFiltered = (next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      for (const p of filtered) {
        if (next) copy.add(p.id)
        else copy.delete(p.id)
      }
      return copy
    })
  }

  const toggleAttended = async (p: Participant, next: boolean) => {
    setLeadParticipants(
      lead.id,
      participants.map((x) => (x.id === p.id ? { ...x, attended: next } : x)),
    )
    const res = await setParticipantAttended(p.id, lead.id, next)
    if (!res.ok) {
      toast.error(res.error)
      setLeadParticipants(
        lead.id,
        participants.map((x) => (x.id === p.id ? { ...x, attended: !next } : x)),
      )
      return
    }
    if (next) toast.success("אושרה נוכחות — נוסף למאגר מודרכים")
    refresh()
  }

  const markAllAttended = async () => {
    for (const p of participants) {
      if (!p.attended) await toggleAttended(p, true)
    }
  }

  const remove = async (p: Participant) => {
    const res = await removeParticipant(p.id, lead.id)
    if (!res.ok) {
      toast.error("שגיאה במחיקה")
      return
    }
    setLeadParticipants(
      lead.id,
      participants.filter((x) => x.id !== p.id),
    )
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      copy.delete(p.id)
      return copy
    })
    toast.success("המשתתף נמחק")
    refresh()
  }

  const openEdit = (p: Participant) => {
    const courseLabel = p.courseType
      ? formatCourseTypeLabel(p.courseType, { catalog: settings.courses })
      : ""
    const inList = Boolean(courseLabel && courseOptions.includes(courseLabel))
    setEditP(p)
    setEditForm({
      fullName: p.name,
      idNumber: p.idNumber,
      phone: p.phone || "",
      email: p.email || "",
      feedback: p.feedback || "",
      isExternal: Boolean(p.isExternal),
      courseType: inList
        ? courseLabel
        : courseLabel
          ? COURSE_TYPE_OTHER
          : "",
      courseTypeOther: inList ? "" : courseLabel,
      courseCategory: p.courseCategory || "",
      agreedPrice: p.agreedPrice != null ? String(p.agreedPrice) : "",
    })
  }

  const saveEdit = async () => {
    if (!editP) return
    const priceRaw = editForm.agreedPrice.trim()
    const agreedPrice =
      priceRaw === "" ? null : Number(priceRaw)
    if (editForm.isExternal && agreedPrice != null && !Number.isFinite(agreedPrice)) {
      toast.error("מחיר לא תקין")
      return
    }
    let courseType = editForm.isExternal ? editForm.courseType : null
    if (editForm.isExternal && editForm.courseType === COURSE_TYPE_OTHER) {
      const custom = editForm.courseTypeOther.trim()
      if (!custom) {
        toast.error("יש למלא סוג קורס")
        return
      }
      if (!isAllowedCourseTypeValue(custom)) {
        toast.error(COURSE_TYPE_FORMAT_ERROR)
        return
      }
      await ensureCustomCourseTypeOption(custom)
      courseType = custom
    }
    const res = await updateParticipantDetails(editP.id, lead.id, {
      fullName: editForm.fullName,
      idNumber: editForm.idNumber,
      phone: editForm.phone,
      email: editForm.email,
      feedback: editForm.feedback,
      isExternal: editForm.isExternal,
      courseType,
      courseCategory: editForm.isExternal ? editForm.courseCategory : null,
      agreedPrice: editForm.isExternal ? agreedPrice : null,
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("פרטי המשתתף עודכנו")
    setEditP(null)
    refresh()
  }

  const markLmsLocal = (ids: string[]) => {
    const set = new Set(ids)
    setLeadParticipants(
      lead.id,
      participants.map((p) =>
        set.has(p.id) ? { ...p, hasLmsAccess: true } : p,
      ),
    )
  }

  const createLmsUsers = async (ids: string[]) => {
    if (!ids.length) {
      toast.error("אין משתתפים ליצירת משתמש")
      return
    }
    setLmsBusy(ids.length === 1 ? ids[0]! : "bulk")
    try {
      const res = await sendLmsAccessToSheets(ids)
      if (!res.ok) {
        toast.error(res.error)
        return
      }

      const okIds = res.data.participantIds
      if (okIds.length) markLmsLocal(okIds)

      const credUpdates: Record<string, LmsCredentialMeta> = {}
      for (const id of okIds) {
        const participant = participants.find((p) => p.id === id)
        if (!participant?.idNumber?.trim()) continue
        credUpdates[id] = {
          participantId: id,
          fullName: participant.name,
          email: participant.email,
          username: participant.idNumber.trim(),
          password: participant.idNumber.trim(),
          loginUrl: settings.lmsLoginUrl,
        }
      }
      if (Object.keys(credUpdates).length) {
        setLmsCredentials((prev) => ({ ...prev, ...credUpdates }))
      }

      toast.success(
        res.data.message ||
          "פרטי הגישה למערכת הלמידה נשלחו בהצלחה!",
      )
      refresh()
    } catch {
      toast.error("שגיאת רשת בשליחת פרטי LMS")
    } finally {
      setLmsBusy(null)
    }
  }

  const openWhatsApp = (p: Participant) => {
    if (!p.phone?.trim()) {
      toast.error("חסר טלפון למשתתף")
      return
    }
    const stored = lmsCredentials[p.id]
    const text = p.hasLmsAccess
      ? lmsParticipantWhatsAppMessage({
          fullName: p.name,
          loginUrl: stored?.loginUrl || settings.lmsLoginUrl || "",
        })
      : `היי ${p.name},`
    window.open(whatsappLink(p.phone, text), "_blank", "noopener,noreferrer")
  }

  const sendZoomLink = (p: Participant) => {
    // kept for backward references below in the component
    sendZoomWhatsApp(p)
  }

  const toolbar = participants.length > 0 && (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או ת״ז"
          className="h-9 pr-9 text-sm"
          inputMode="search"
        />
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
          {participants.length} נרשמים
          <span className="font-medium text-muted-foreground">
            · {attendedCount} נוכחים
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-xl md:w-auto"
          onClick={markAllAttended}
        >
          <CheckCheck className="size-4" />
          אישור נוכחות לכולם
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-2 rounded-xl"
          disabled={selectedIds.size === 0 || Boolean(lmsBusy)}
          onClick={() => {
            if (selectedIds.size === 0) {
              toast.error("יש לסמן משתתפים לפתיחת משתמש בלמידה")
              return
            }
            if (!selectedPendingLms.length) {
              toast.error("לכל הנבחרים כבר יש גישת LMS")
              return
            }
            void createLmsUsers(selectedPendingLms.map((p) => p.id))
          }}
        >
          <UserPlus className="size-4" />
          {lmsBusy === "bulk"
            ? "שולח פרטי LMS…"
            : `פתיחת משתמש בלמידה${selectedPendingLms.length ? ` (${selectedPendingLms.length})` : ""}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-xl md:w-auto"
          disabled={selectedIds.size === 0}
          onClick={() => {
            if (selectedIds.size === 0) {
              toast.error("יש לסמן משתתפים להפקת תעודות")
              return
            }
            setIssueOpen(true)
          }}
        >
          <ScrollText className="size-4" />
          📜 הפק תעודות מרחוק
          {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
        </Button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold md:hidden">
          <Checkbox
            checked={allFilteredSelected}
            onCheckedChange={(v) => toggleSelectAllFiltered(Boolean(v))}
          />
          סמן הכל
        </label>
      </div>
    </div>
  )

  return (
    <CollapsibleSection
      title="משתתפים"
      subtitle={`${participants.length} נרשמו · ${attendedCount} נוכחים`}
      defaultOpen
      alwaysOpen
      action={
        <button
          type="button"
          onClick={() => void refreshParticipants()}
          disabled={polling}
          aria-label="רענון משתתפים"
          title="רענון משתתפים"
          className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              polling && "animate-spin text-primary",
            )}
          />
        </button>
      }
    >
      {toolbar}

      {participants.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          עדיין אין משתתפים — השתמשו ב״הוסף משתתפים״
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          לא נמצאו משתתפים התואמים לחיפוש
        </p>
      ) : (
        <>
          {/* —— Desktop table —— */}
          <div className="hidden w-full max-w-full overflow-x-hidden md:block">
            <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 font-semibold">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(v) =>
                          toggleSelectAllFiltered(Boolean(v))
                        }
                        aria-label="בחר הכל"
                      />
                    </th>
                    <th className="w-[18%] px-3 py-2 font-semibold">שם</th>
                    <th className="w-[14%] px-3 py-2 font-semibold">טלפון</th>
                    <th className="w-[12%] px-3 py-2 font-semibold">ת״ז</th>
                    <th className="w-[18%] px-3 py-2 font-semibold">דוא״ל</th>
                    <th className="w-[14%] px-3 py-2 font-semibold">גישת LMS</th>
                    <th className="w-[16%] px-3 py-2 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const busy = lmsBusy === p.id
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border hover:bg-secondary/30"
                      >
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={(v) =>
                              toggleSelected(p.id, Boolean(v))
                            }
                            aria-label={`בחירה ${p.name}`}
                          />
                        </td>
                        <td className="max-w-0 truncate px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {p.attended && (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                                title="נוכח"
                              />
                            )}
                            <span className="truncate">{p.name}</span>
                            {p.isExternal ? <ExternalTag /> : null}
                            {p.source === "Wix" ? <WixTag /> : null}
                            {p.isExternal && p.agreedPrice != null ? (
                              <span className="shrink-0 text-[10px] font-semibold text-pink-700">
                                {formatCurrency(p.agreedPrice)}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td
                          className="max-w-0 truncate px-3 py-2 dir-ltr text-left"
                          dir="ltr"
                        >
                          {p.phone || "—"}
                        </td>
                        <td
                          className="max-w-0 truncate px-3 py-2 dir-ltr text-left"
                          dir="ltr"
                        >
                          {p.idNumber}
                        </td>
                        <td className="max-w-0 truncate px-3 py-2 text-muted-foreground">
                          {p.email || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {p.hasLmsAccess ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <BadgeCheck className="size-4" />
                              <span className="text-xs font-medium">פעיל</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(lmsBusy)}
                              onClick={() => void createLmsUsers([p.id])}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                              aria-label="פתח משתמש בלמידה"
                            >
                              {busy ? (
                                <RefreshCw className="size-3.5 animate-spin" />
                              ) : (
                                <GraduationCap className="size-3.5" />
                              )}
                              פתח משתמש בלמידה
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            {p.phone?.trim() ? (
                              <a
                                href={`tel:${p.phone}`}
                                className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                                aria-label="חיוג"
                                title="חיוג"
                              >
                                <Phone className="size-3.5" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openWhatsApp(p)}
                              className="flex size-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                              aria-label="וואטסאפ"
                              title="וואטסאפ"
                            >
                              <MessageCircle className="size-3.5" />
                            </button>
                            {canSendZoom ? (
                              <button
                                type="button"
                                onClick={() => openZoomSend(p)}
                                className="flex size-8 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50"
                                aria-label="שלח קישור לזום"
                                title="שלח קישור לזום"
                              >
                                <Video className="size-3.5" />
                              </button>
                            ) : null}
                            {p.certificateUrl?.trim() ? (
                              <a
                                href={p.certificateUrl.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex size-8 items-center justify-center rounded-lg text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                                aria-label="תעודת PDF"
                                title="פתח תעודה"
                              >
                                <FileCheck className="size-3.5" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                void toggleAttended(p, !p.attended)
                              }
                              className={cn(
                                "flex size-8 items-center justify-center rounded-lg hover:bg-secondary",
                                p.attended
                                  ? "text-emerald-700"
                                  : "text-muted-foreground",
                              )}
                              aria-label="נוכחות"
                              title="סימון נוכחות"
                            >
                              <CheckCheck className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                              aria-label="עריכה"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPayParticipant(p)}
                              className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                              aria-label="רישום תשלום למשתתף"
                              title="רישום תשלום למשתתף"
                            >
                              <ScrollText className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(p)}
                              className="flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                              aria-label="מחק"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* —— Mobile cards —— */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((p) => {
              const open = expandedId === p.id
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-border bg-secondary/30"
                >
                  <div className="flex items-center gap-1.5 p-2.5">
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={(v) =>
                        toggleSelected(p.id, Boolean(v))
                      }
                      aria-label={`בחירה ${p.name}`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-right"
                      onClick={() => setExpandedId(open ? null : p.id)}
                    >
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {p.attended && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                            title="נוכח"
                          />
                        )}
                        {p.hasLmsAccess && (
                          <BadgeCheck
                            className="size-3.5 shrink-0 text-emerald-600"
                            aria-label="יש גישת LMS"
                          />
                        )}
                        <span className="truncate text-foreground">
                          {p.name} – {p.idNumber}
                        </span>
                        {p.isExternal ? <ExternalTag /> : null}
                        {p.source === "Wix" ? <WixTag /> : null}
                      </p>
                    </button>

                    <ParticipantMobileKebab
                      p={p}
                      lmsBusy={lmsBusy}
                      onWhatsApp={() => openWhatsApp(p)}
                      onSendZoom={
                        canSendZoom ? () => openZoomSend(p) : undefined
                      }
                      onToggleAttended={() =>
                        void toggleAttended(p, !p.attended)
                      }
                      onCreateLms={() => void createLmsUsers([p.id])}
                      onEdit={() => openEdit(p)}
                      onPayment={() => setPayParticipant(p)}
                      onRemove={() => void remove(p)}
                    />
                  </div>
                  {open && (
                    <div className="space-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                      {p.isExternal ? (
                        <p className="rounded-lg bg-pink-50 px-2 py-1.5 text-sm font-bold text-pink-800">
                          מחיר:{" "}
                          {p.agreedPrice != null
                            ? formatCurrency(p.agreedPrice)
                            : "—"}
                        </p>
                      ) : null}
                      {p.isExternal && p.courseType ? (
                        <p>
                          סוג קורס:{" "}
                          {formatCourseTypeLabel(p.courseType, {
                            catalog: settings.courses,
                          })}
                        </p>
                      ) : null}
                      {p.isExternal && p.courseCategory ? (
                        <p>קטגוריה: {p.courseCategory}</p>
                      ) : null}
                      <p>טלפון: {p.phone || "—"}</p>
                      <p>דוא״ל: {p.email || "—"}</p>
                      {p.attended && (
                        <p className="font-medium text-emerald-700">
                          ✓ נוכח — במאגר מודרכים
                        </p>
                      )}
                      {p.hasLmsAccess && (
                        <p className="font-medium text-emerald-700">
                          ✓ משתמש LMS פעיל (שם משתמש וסיסמה = ת״ז)
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Dialog open={Boolean(editP)} onOpenChange={(o) => !o && setEditP(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>עריכת משתתף</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={editForm.fullName}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, fullName: e.target.value }))
              }
              placeholder="שם מלא"
            />
            <Input
              value={editForm.idNumber}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, idNumber: e.target.value }))
              }
              placeholder="ת״ז"
              dir="ltr"
            />
            <Input
              value={editForm.phone}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, phone: e.target.value }))
              }
              placeholder="טלפון"
              dir="ltr"
            />
            <Input
              value={editForm.email}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="דוא״ל"
              dir="ltr"
            />
            <Input
              value={editForm.feedback}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, feedback: e.target.value }))
              }
              placeholder="משוב"
            />
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={editForm.isExternal}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, isExternal: Boolean(v) }))
                }
              />
              משתתף חיצוני
            </label>
            {editForm.isExternal ? (
              <>
                <div>
                  <Label className="mb-1.5 block text-sm">סוג קורס</Label>
                  <Select
                    value={editForm.courseType || undefined}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, courseType: v ?? "" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחר סוג קורס" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseOptions.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                      <SelectItem value={COURSE_TYPE_OTHER}>
                        {COURSE_TYPE_OTHER}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.courseType === COURSE_TYPE_OTHER ? (
                  <div>
                    <Label className="mb-1.5 block text-sm">סוג קורס חדש</Label>
                    <Input
                      value={editForm.courseTypeOther}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          courseTypeOther: e.target.value,
                        }))
                      }
                      placeholder='לדוגמה: 22, רענון 8, BLS'
                    />
                  </div>
                ) : null}
                <div>
                  <Label className="mb-1.5 block text-sm">קטגוריה</Label>
                  <Select
                    value={editForm.courseCategory || undefined}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, courseCategory: v ?? "" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחר קטגוריה" />
                    </SelectTrigger>
                    <SelectContent>
                      {editForm.courseCategory &&
                      !categoryOptions.includes(editForm.courseCategory) ? (
                        <SelectItem value={editForm.courseCategory}>
                          {editForm.courseCategory}
                        </SelectItem>
                      ) : null}
                      {categoryOptions.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm">מחיר</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.agreedPrice}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, agreedPrice: e.target.value }))
                    }
                    placeholder="מחיר"
                    dir="ltr"
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} className="w-full">
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IssueCertificatesDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        leadId={lead.id}
        participantIds={[...selectedIds]}
      />

      <ParticipantPaymentDialog
        leadId={lead.id}
        participant={payParticipant}
        open={Boolean(payParticipant)}
        onOpenChange={(o) => !o && setPayParticipant(null)}
      />

      <SendZoomLinkDialog
        open={zoomDialogOpen}
        onOpenChange={(o) => {
          if (!o) setZoomDialogParticipant(null)
        }}
        participant={zoomDialogParticipant}
        session={zoomDialogSession}
        courseTitle={lead.courseType || "קורס עזרה ראשונה"}
      />
    </CollapsibleSection>
  )
}

function SendZoomLinkDialog({
  open,
  onOpenChange,
  participant,
  session,
  courseTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  participant: Participant | null
  session: { date: string; time: string; zoomLink?: string } | null
  courseTitle: string
}) {
  const participantPhone = participant?.phone?.trim() || ""
  const participantEmail = participant?.email?.trim() || ""

  const zoomLink = session?.zoomLink?.trim()
  const message = participant && zoomLink && session
    ? zoomInviteWhatsAppMessage(participant.name, {
        date: session.date,
        time: session.time,
        zoomLink,
      })
    : ""

  const [emailBusy, setEmailBusy] = useState(false)

  const sendWhatsApp = () => {
    if (!participant) return
    if (!participantPhone) {
      toast.error("חסר טלפון למשתתף")
      return
    }
    if (!message.trim()) {
      toast.error("יש להזין קישור זום בטופס ההדרכה")
      return
    }
    window.open(
      whatsappLink(participantPhone, message),
      "_blank",
      "noopener,noreferrer",
    )
    onOpenChange(false)
  }

  const sendEmail = () => {
    void (async () => {
      if (!participant) return
      if (!participantEmail) {
        toast.error("אין כתובת מייל למשתתף זה")
        return
      }
      if (!message.trim() || !zoomLink || !session) {
        toast.error("יש להזין קישור זום בטופס ההדרכה")
        return
      }

      setEmailBusy(true)
      try {
        const res = await sendZoomLinkEmailAction({
          email: participantEmail,
          fullName: (participant as unknown as { fullName?: string }).fullName || participant.name,
          zoomLink: zoomLink || "",
          date: formatDate(session.date),
          dayOfWeek: weekdayNameHe(session.date),
          startTime: session.time,
          courseTitle: courseTitle || "קורס עזרה ראשונה",
        })
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("קישור הזום נשלח בהצלחה למייל!")
        onOpenChange(false)
      } catch {
        toast.error("שגיאה בשליחת קישור הזום למייל")
      } finally {
        setEmailBusy(false)
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle>שלח קישור לזום</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {participant?.name || ""}
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <Button
            type="button"
            className="h-auto w-full justify-start gap-3 rounded-xl py-3"
            onClick={sendWhatsApp}
          >
            <MessageCircle className="size-5 shrink-0 text-emerald-700" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-semibold">שלח בוואטסאפ</span>
              <span className="text-xs font-normal text-muted-foreground">
                שימוש בטלפון הרשום למשתתף
              </span>
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 rounded-xl py-3"
            disabled={!participantEmail}
            onClick={sendEmail}
            title={
              !participantEmail ? "אין כתובת מייל למשתתף זה" : undefined
            }
          >
            ✉️
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-semibold">שלח במייל</span>
              <span className="text-xs font-normal text-muted-foreground">
                {emailBusy
                  ? "שולח…"
                  : participantEmail
                    ? participantEmail
                    : "אין כתובת מייל למשתתף זה"}
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
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
