"use client"

import { useCallback, useMemo, useState, Fragment } from "react"
import {
  ArrowRightLeft,
  Award,
  BadgeCheck,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  GraduationCap,
  Link2,
  Loader2,
  MessageCircle,
  MoreVertical,
  Pencil,
  Phone,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Video,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { ExamScoreBadge } from "@/components/exam/exam-score-badge"
import { CertifyingBodyBadge } from "@/components/leads/certifying-body-badge"
import { SessionMeetingBadge } from "@/components/leads/session-meeting-badge"
import { TraineeContactDetailsPanel } from "@/components/clients/trainee-contact-details-panel"
import {
  CertificateStatusBadge,
  CertificateStatusSection,
} from "@/components/certificates/certificate-status"
import { IssueCertificatesDialog } from "@/components/leads/issue-certificates-dialog"
import { ParticipantPaymentDialog } from "@/components/leads/participant-payment-dialog"
import {
  formatTrainingOptionLabel,
} from "@/components/clients/training-select"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  transferParticipantToLead,
  updateParticipantDetails,
} from "@/lib/actions"
import { updateParticipantCertificateUrlAction } from "@/lib/certificates-hub-actions"
import {
  COURSE_TYPE_FORMAT_ERROR,
  COURSE_TYPE_OTHER,
  collectCourseTypeOptions,
  formatCourseTypeLabel,
  formatLeadCourseType,
  isAllowedCourseTypeValue,
} from "@/lib/course-type"
import {
  collectLeadCategoryOptions,
  formatCurrency,
  formatDate,
  formatLeadCategory,
  weekdayNameHe,
  whatsappLink,
  zoomInviteWhatsAppMessage,
} from "@/lib/helpers"
import { lmsParticipantWhatsAppMessage } from "@/lib/lms"
import { pickZoomSessionForInvite } from "@/lib/payment"
import { useApp } from "@/lib/store"
import { displayCertifyingBody } from "@/lib/certifying-body"
import { buildParticipantSessionNumbers } from "@/lib/participant-session"
import type { ParticipantSessionInfo } from "@/lib/participant-session"
import { isParticipantPaid } from "@/lib/training-profit"
import type { Lead, Participant, Trainee } from "@/lib/types"
import { CERTIFYING_BODY_OPTIONS } from "@/lib/types"
import { cn } from "@/lib/utils"

function ExternalTag() {
  return (
    <span className="shrink-0 rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-pink-700">
      חיצוני
    </span>
  )
}

/** קישור תעודה אפקטיבי — ממשתתף או ממודרך מקושר */
function effectiveCertificateUrl(
  p: Participant,
  trainee?: Trainee | null,
): string {
  return (
    p.certificateUrl?.trim() || trainee?.certificateUrl?.trim() || ""
  )
}

/** אייקון תעודה ליד שם המודרך — פתיחה / הוספת קישור */
function ParticipantCertificateLinkControls({
  url,
  name,
  onEdit,
}: {
  url: string
  name: string
  onEdit: () => void
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
          title="פתח תעודה"
          aria-label={`פתח תעודה של ${name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      <button
        type="button"
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-lg hover:bg-secondary",
          url
            ? "text-amber-600 hover:text-amber-700"
            : "text-muted-foreground hover:text-foreground",
        )}
        title={url ? "עריכת קישור תעודה" : "הוספת קישור תעודה"}
        aria-label={
          url
            ? `עריכת קישור תעודה של ${name}`
            : `הוספת קישור תעודה ל־${name}`
        }
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onEdit()
        }}
      >
        {url ? <Award className="size-3.5" /> : <Link2 className="size-3.5" />}
      </button>
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

function LeadTag() {
  return (
    <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
      ליד
    </span>
  )
}

/** תגיות משניות — לא בשורת השם הראשית */
function ParticipantSecondaryTags({ p }: { p: Participant }) {
  if (!p.isLead && p.source !== "Wix") return null
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 ps-6 text-[10px] text-muted-foreground md:ps-7">
      {p.isLead ? <LeadTag /> : null}
      {p.source === "Wix" ? <WixTag /> : null}
    </span>
  )
}

/** שורת מטא-דאטה (מובייל) מתחת לשם */
function ParticipantMobileMeta({
  p,
  session,
}: {
  p: Participant
  session?: ParticipantSessionInfo
}) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {p.idNumber ? (
        <span dir="ltr" className="tabular-nums">
          {p.idNumber}
        </span>
      ) : null}
      {p.attended ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-emerald-500"
          title="נוכח"
        />
      ) : null}
      {p.hasLmsAccess ? (
        <BadgeCheck
          className="size-3.5 shrink-0 text-emerald-600"
          aria-label="יש גישת LMS"
        />
      ) : null}
      <SessionMeetingBadge session={session} />
      {p.isExternal ? <ExternalTag /> : null}
      {p.isLead ? <LeadTag /> : null}
      {p.source === "Wix" ? <WixTag /> : null}
    </p>
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
  certificateUrl,
  onWhatsApp,
  onSendZoom,
  onToggleAttended,
  onCreateLms,
  onEditCertificateUrl,
  onEdit,
  onPayment,
  onTransfer,
  onRemove,
}: {
  p: Participant
  lmsBusy: string | null
  certificateUrl: string
  onWhatsApp: () => void
  onSendZoom?: () => void
  onToggleAttended: () => void
  onCreateLms: () => void
  onEditCertificateUrl: () => void
  onEdit: () => void
  onPayment: () => void
  onTransfer: () => void
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
            {p.isLead ? (
              <p className="text-xs font-medium text-violet-700">★ מסומן כליד</p>
            ) : null}
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
            {certificateUrl ? (
              <a
                href={certificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-secondary"
                onClick={() => setOpen(false)}
              >
                <FileCheck className="size-5 shrink-0 text-amber-500" />
                פתח תעודה
              </a>
            ) : null}
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
              onClick={() => run(onEditCertificateUrl)}
            >
              {certificateUrl ? (
                <Award className="size-5 shrink-0 text-amber-600" />
              ) : (
                <Link2 className="size-5 shrink-0 text-muted-foreground" />
              )}
              {certificateUrl ? "עריכת קישור תעודה" : "הוספת קישור תעודה"}
            </button>
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
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-base hover:bg-secondary"
              onClick={() => run(onTransfer)}
            >
              <ArrowRightLeft className="size-5 shrink-0 text-primary" />
              העבר לקורס אחר
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
}: {
  lead: Lead
  /** @deprecated רענון אוטומטי בוטל — רק כפתור רענון ידני */
  active?: boolean
}) {
  const { setLeadParticipants, refresh, settings, leads, trainees, updateTraineeLocal } =
    useApp()
  const [polling, setPolling] = useState(false)
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
  const [editSaving, setEditSaving] = useState(false)
  const [certUrlP, setCertUrlP] = useState<Participant | null>(null)
  const [certUrlDraft, setCertUrlDraft] = useState("")
  const [certUrlSaving, setCertUrlSaving] = useState(false)
  const [payParticipant, setPayParticipant] = useState<Participant | null>(null)
  const [transferP, setTransferP] = useState<Participant | null>(null)
  const [transferLeadId, setTransferLeadId] = useState("")
  const [transferSaving, setTransferSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Participant | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    fullName: "",
    idNumber: "",
    phone: "",
    email: "",
    notes: "",
    isExternal: false,
    isLead: false,
    courseType: "",
    courseTypeOther: "",
    courseCategory: "",
    courseCategoryOther: "",
    agreedPrice: "",
    certifyingBody: "",
  })
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueParticipantIds, setIssueParticipantIds] = useState<string[]>([])

  const CATEGORY_OTHER = "אחר"

  const participants = lead.participants || []
  const attendedCount = participants.filter((p) => p.attended).length
  const zoomSession = pickZoomSessionForInvite(lead)
  const canSendZoom = Boolean(zoomSession)

  const traineeById = useMemo(() => {
    const map = new Map<string, Trainee>()
    for (const t of trainees) map.set(t.id, t)
    return map
  }, [trainees])

  /** מפגש 1, 2… לפי ת״ז וסדר תאריכים בכל ההדרכות */
  const sessionByParticipantId = useMemo(() => {
    const merged = leads.map((l) => (l.id === lead.id ? lead : l))
    if (!leads.some((l) => l.id === lead.id)) merged.push(lead)
    return buildParticipantSessionNumbers(merged)
  }, [leads, lead])

  const traineeForParticipant = (p: Participant) => {
    if (p.traineeId) return traineeById.get(p.traineeId)
    // fallback: match by id number when linked trainee not yet hydrated
    const id = p.idNumber?.trim()
    if (!id) return undefined
    return trainees.find((t) => t.idNumber === id)
  }

  const certificateUrlFor = (p: Participant) =>
    effectiveCertificateUrl(p, traineeForParticipant(p))

  const openCertUrlEdit = (p: Participant) => {
    setCertUrlP(p)
    setCertUrlDraft(certificateUrlFor(p))
  }

  const saveCertUrl = async () => {
    if (!certUrlP || certUrlSaving) return
    setCertUrlSaving(true)
    const res = await updateParticipantCertificateUrlAction({
      participantId: certUrlP.id,
      certificateUrl: certUrlDraft.trim() || null,
    })
    setCertUrlSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const nextUrl = res.data.certificateUrl || undefined
    setLeadParticipants(
      lead.id,
      participants.map((row) =>
        row.id === certUrlP.id
          ? { ...row, certificateUrl: nextUrl }
          : row,
      ),
    )
    const trainee = traineeForParticipant(certUrlP)
    if (trainee?.id) {
      updateTraineeLocal(trainee.id, { certificateUrl: nextUrl })
    }
    toast.success("קישור התעודה נשמר")
    setCertUrlP(null)
  }

  const participantNotes = (p: Participant) => {
    const own = p.notes?.trim()
    if (own) return own
    return traineeForParticipant(p)?.notes?.trim() || ""
  }

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
    const list = !q
      ? [...participants]
      : participants.filter(
          (p) =>
            p.name.includes(q) ||
            (p.phone || "").includes(q) ||
            p.idNumber.includes(q) ||
            (p.email || "").includes(q),
        )

    const courseLabel = (p: Participant) =>
      (
        formatCourseTypeLabel(p.courseType || lead.courseType, {
          other: p.courseType ? undefined : lead.courseTypeOther,
          catalog: settings.courses,
        }) || ""
      ).trim()

    const categoryLabel = (p: Participant) =>
      formatLeadCategory(
        p.courseCategory ||
          (lead.category === "אחר" ? lead.categoryOther : lead.category),
      ).trim()

    return list.sort((a, b) => {
      const priceA = Number(a.agreedPrice ?? 0)
      const priceB = Number(b.agreedPrice ?? 0)
      const safeA = Number.isFinite(priceA) ? priceA : 0
      const safeB = Number.isFinite(priceB) ? priceB : 0
      if (safeA !== safeB) return safeA - safeB

      const courseDiff = courseLabel(a).localeCompare(courseLabel(b), "he")
      if (courseDiff !== 0) return courseDiff

      return categoryLabel(a).localeCompare(categoryLabel(b), "he")
    })
  }, [
    participants,
    query,
    lead.courseType,
    lead.courseTypeOther,
    lead.category,
    lead.categoryOther,
    settings.courses,
  ])

  const courseOptions = useMemo(
    () => collectCourseTypeOptions(leads, settings.courses),
    [leads, settings.courses],
  )

  const categoryOptions = useMemo(
    () => collectLeadCategoryOptions(leads),
    [leads],
  )

  const transferTargets = useMemo(
    () =>
      leads
        .filter(
          (l) =>
            l.id !== lead.id &&
            (l.status === "new" || l.status === "closed"),
        )
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [leads, lead.id],
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

  // רענון רק בלחיצה על כפתור החצים — ללא רענון אוטומטי בכניסה לטאב

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

  const toggleAttended = async (p: Participant, next: boolean, silent = false) => {
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
    if (next && !silent) toast.success("אושרה נוכחות — נוסף למאגר מודרכים")
    refresh()
  }

  const markAllAttended = async () => {
    const targets =
      selectedIds.size > 0
        ? participants.filter((p) => selectedIds.has(p.id) && !p.attended)
        : participants.filter((p) => !p.attended)
    if (!targets.length) {
      toast.error(
        selectedIds.size > 0
          ? "לכל הנבחרים כבר אושרה נוכחות"
          : "לכולם כבר אושרה נוכחות",
      )
      return
    }
    for (const p of targets) {
      await toggleAttended(p, true, true)
    }
    toast.success(
      targets.length === 1
        ? "אושרה נוכחות"
        : `אושרה נוכחות ל־${targets.length} משתתפים`,
    )
  }

  const unmarkAllAttended = async () => {
    const targets =
      selectedIds.size > 0
        ? participants.filter((p) => selectedIds.has(p.id) && p.attended)
        : participants.filter((p) => p.attended)
    if (!targets.length) {
      toast.error(
        selectedIds.size > 0
          ? "אין בין הנבחרים משתתפים עם נוכחות לביטול"
          : "אין משתתפים עם נוכחות לביטול",
      )
      return
    }
    for (const p of targets) {
      await toggleAttended(p, false, true)
    }
    toast.success(
      targets.length === 1
        ? "נוכחות בוטלה"
        : `נוכחות בוטלה ל־${targets.length} משתתפים`,
    )
  }

  const confirmRemove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const p = deleteTarget
    const res = await removeParticipant(p.id, lead.id)
    setDeleting(false)
    if (!res.ok) {
      toast.error(res.error || "שגיאה במחיקה")
      return
    }
    setDeleteTarget(null)
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

  const openTransfer = (p: Participant) => {
    setTransferP(p)
    setTransferLeadId("")
  }

  const confirmTransfer = async () => {
    if (!transferP) return
    if (!transferLeadId) {
      toast.error("יש לבחור הדרכה יעד")
      return
    }
    setTransferSaving(true)
    const res = await transferParticipantToLead(
      transferP.id,
      lead.id,
      transferLeadId,
    )
    setTransferSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setLeadParticipants(
      lead.id,
      participants.filter((x) => x.id !== transferP.id),
    )
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      copy.delete(transferP.id)
      return copy
    })
    setTransferP(null)
    setTransferLeadId("")
    toast.success("המשתתף הועבר להדרכה אחרת")
    refresh()
  }

  const openEdit = (p: Participant) => {
    const courseLabel = p.courseType
      ? formatCourseTypeLabel(p.courseType, { catalog: settings.courses })
      : ""
    const inList = Boolean(courseLabel && courseOptions.includes(courseLabel))
    const cat = p.courseCategory || ""
    const catInList = Boolean(cat && categoryOptions.includes(cat))
    setEditP(p)
    setEditForm({
      fullName: p.name,
      idNumber: p.idNumber,
      phone: p.phone || "",
      email: p.email || "",
      notes: participantNotes(p),
      isExternal: Boolean(p.isExternal),
      isLead: Boolean(p.isLead),
      courseType: inList
        ? courseLabel
        : courseLabel
          ? COURSE_TYPE_OTHER
          : "",
      courseTypeOther: inList ? "" : courseLabel,
      courseCategory: catInList ? cat : cat ? CATEGORY_OTHER : "",
      courseCategoryOther: catInList ? "" : cat,
      agreedPrice: p.agreedPrice != null ? String(p.agreedPrice) : "",
      certifyingBody:
        p.certifyingBody ||
        displayCertifyingBody({
          certifyingBody: p.certifyingBody,
          isExternal: p.isExternal,
          leadCertificateDelivery: lead.certificateDelivery,
        }) ||
        "",
    })
  }

  const saveEdit = async () => {
    if (!editP || editSaving) return
    const priceRaw = editForm.agreedPrice.trim()
    const agreedPrice =
      priceRaw === "" ? null : Number(priceRaw)
    if (
      (editForm.isExternal || editForm.isLead) &&
      agreedPrice != null &&
      !Number.isFinite(agreedPrice)
    ) {
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
      courseType = custom
    }
    let courseCategory = editForm.isExternal ? editForm.courseCategory : null
    if (editForm.isExternal && editForm.courseCategory === CATEGORY_OTHER) {
      const customCat = editForm.courseCategoryOther.trim()
      if (!customCat) {
        toast.error("יש למלא קטגוריה")
        return
      }
      courseCategory = customCat
    }

    setEditSaving(true)
    try {
      if (editForm.isExternal && editForm.courseType === COURSE_TYPE_OTHER) {
        await ensureCustomCourseTypeOption(editForm.courseTypeOther.trim())
      }
      const res = await updateParticipantDetails(editP.id, lead.id, {
        fullName: editForm.fullName,
        idNumber: editForm.idNumber,
        phone: editForm.phone,
        email: editForm.email,
        notes: editForm.notes,
        isExternal: editForm.isExternal,
        isLead: editForm.isLead,
        courseType,
        courseCategory,
        agreedPrice:
          editForm.isExternal || editForm.isLead ? agreedPrice : null,
        certifyingBody: editForm.certifyingBody.trim() || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setLeadParticipants(
        lead.id,
        participants.map((p) =>
          p.id === editP.id
            ? {
                ...p,
                name: editForm.fullName.trim(),
                idNumber: editForm.idNumber.trim(),
                phone: editForm.phone.trim() || undefined,
                email: editForm.email.trim() || undefined,
                notes: editForm.notes.trim() || undefined,
                isExternal: editForm.isExternal,
                isLead: editForm.isLead,
                certifyingBody: editForm.certifyingBody.trim() || undefined,
              }
            : p,
        ),
      )
      setEditP(null)
      toast.success("פרטי המודרך עודכנו בהצלחה")
      void refresh()
    } finally {
      setEditSaving(false)
    }
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

  const openIssueForParticipant = (p: Participant) => {
    setIssueParticipantIds([p.id])
    setIssueOpen(true)
  }

  const sendZoomLink = (p: Participant) => {
    // kept for backward references below in the component
    sendZoomWhatsApp(p)
  }

  const exportParticipantsExcel = () => {
    if (!participants.length) {
      toast.error("אין משתתפים לייצוא")
      return
    }

    const rows = participants.map((p) => ({
      "שם מלא": (p.name || "").trim(),
      "תעודת זהות": (p.idNumber || "").trim(),
    }))

    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: ["שם מלא", "תעודת זהות"],
    })
    sheet["!cols"] = [{ wch: 28 }, { wch: 16 }]

    const book = XLSX.utils.book_new()
    book.Workbook = book.Workbook || {}
    book.Workbook.Views = [{ RTL: true }]
    XLSX.utils.book_append_sheet(book, sheet, "משתתפים")

    const trainingTitle = formatLeadCourseType(lead, settings.courses) ||
      lead.name ||
      "הדרכה"
    const datePart =
      lead.date || new Date().toISOString().slice(0, 10)
    const safeTitle = trainingTitle
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
    const filename = `משתתפים - ${safeTitle} - ${datePart}.xlsx`

    XLSX.writeFile(book, filename)
    toast.success(`יוצאו ${participants.length} משתתפים`)
  }

  const toolbar = participants.length > 0 && (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון או ת״ז"
            className="h-9 pr-9 text-sm"
            inputMode="search"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0 rounded-xl"
          title="ייצוא משתתפים לאקסל"
          aria-label="ייצוא משתתפים לאקסל"
          onClick={exportParticipantsExcel}
        >
          <FileSpreadsheet className="size-4" />
        </Button>
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
          onClick={() => void markAllAttended()}
        >
          <CheckCheck className="size-4" />
          אישור נוכחות לכולם
          {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
        </Button>
        {attendedCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl border-amber-300 text-amber-900 hover:bg-amber-50 md:w-auto"
            onClick={() => void unmarkAllAttended()}
          >
            <XCircle className="size-4" />
            בטל נוכחות לכולם
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
        ) : null}
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
            setIssueParticipantIds([...selectedIds])
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
                    <th className="w-[16%] px-3 py-2 font-semibold">שם מודרך</th>
                    <th className="w-[12%] px-3 py-2 font-semibold">
                      תעודות דרך מי
                    </th>
                    <th className="w-[12%] px-3 py-2 font-semibold">
                      הדרכה שיוך
                    </th>
                    <th className="w-[11%] px-3 py-2 font-semibold">סוג קורס</th>
                    <th className="w-[10%] px-3 py-2 font-semibold">קטגוריה</th>
                    <th className="w-[9%] px-3 py-2 font-semibold">
                      תעודה דיגיטלית
                    </th>
                    <th className="w-[9%] px-3 py-2 font-semibold">
                      תעודה פיזית
                    </th>
                    <th className="w-[11%] px-3 py-2 font-semibold">הערות</th>
                    <th className="w-[10%] px-3 py-2 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const busy = lmsBusy === p.id
                    const trainee = traineeForParticipant(p)
                    const digitalDone = Boolean(trainee?.certificateEmailSent)
                    const physicalDone = Boolean(
                      trainee?.certificateCardPrinted,
                    )
                    const courseTypeLabel =
                      formatCourseTypeLabel(
                        p.courseType || lead.courseType,
                        {
                          other: p.courseType ? undefined : lead.courseTypeOther,
                          catalog: settings.courses,
                        },
                      ) || "—"
                    const categoryLabel = formatLeadCategory(
                      p.courseCategory ||
                        (lead.category === "אחר"
                          ? lead.categoryOther
                          : lead.category),
                    )
                    const open = expandedId === p.id
                    const notes = participantNotes(p)
                    const examScore = p.examScore ?? trainee?.examScore
                    const examCompletedAt =
                      p.examCompletedAt || trainee?.examCompletedAt
                    return (
                      <Fragment key={p.id}>
                        <tr
                          className={cn(
                            "border-t border-border hover:bg-secondary/30",
                            open && "bg-secondary/20",
                          )}
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
                          <td className="max-w-0 px-3 py-2 font-medium">
                            <div className="flex min-w-0 items-start gap-1">
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-right hover:text-primary"
                                onClick={() =>
                                  setExpandedId(open ? null : p.id)
                                }
                                aria-expanded={open}
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {open ? (
                                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                                  )}
                                  {p.attended ? (
                                    <span
                                      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                                      title="נוכח"
                                    />
                                  ) : null}
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {p.name}
                                  </span>
                                  <SessionMeetingBadge
                                    session={sessionByParticipantId.get(p.id)}
                                  />
                                  {p.isExternal ? <ExternalTag /> : null}
                                </span>
                                <ParticipantSecondaryTags p={p} />
                              </button>
                              <ParticipantCertificateLinkControls
                                url={certificateUrlFor(p)}
                                name={p.name}
                                onEdit={() => openCertUrlEdit(p)}
                              />
                            </div>
                          </td>
                          <td className="max-w-0 truncate px-3 py-2">
                            <CertifyingBodyBadge
                              value={displayCertifyingBody({
                                certifyingBody: p.certifyingBody,
                                isExternal: p.isExternal,
                                leadCertificateDelivery:
                                  lead.certificateDelivery,
                              })}
                            />
                          </td>
                          <td
                            className="max-w-0 truncate px-3 py-2 text-muted-foreground"
                            title={lead.name}
                          >
                            {lead.name}
                          </td>
                          <td
                            className="max-w-0 truncate px-3 py-2 text-muted-foreground"
                            title={courseTypeLabel}
                          >
                            {courseTypeLabel}
                          </td>
                          <td
                            className="max-w-0 truncate px-3 py-2 text-muted-foreground"
                            title={categoryLabel}
                          >
                            {categoryLabel}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center">
                              <CertificateStatusBadge
                                kind="digital"
                                done={digitalDone}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center">
                              <CertificateStatusBadge
                                kind="physical"
                                done={physicalDone}
                              />
                            </div>
                          </td>
                          <td
                            className="max-w-0 truncate px-2 py-2 text-xs text-muted-foreground"
                            title={notes || undefined}
                          >
                            {notes || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                                  aria-label={`פעולות · ${p.name}`}
                                >
                                  <MoreVertical className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="min-w-60"
                                >
                                  {!p.hasLmsAccess ? (
                                    <DropdownMenuItem
                                      disabled={Boolean(lmsBusy)}
                                      onClick={() =>
                                        void createLmsUsers([p.id])
                                      }
                                    >
                                      {busy ? (
                                        <RefreshCw className="animate-spin" />
                                      ) : (
                                        <UserCheck className="text-primary" />
                                      )}
                                      פתח משתמש בלמידה
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem disabled>
                                      <BadgeCheck className="text-emerald-600" />
                                      משתמש LMS פעיל
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => openWhatsApp(p)}
                                  >
                                    <MessageCircle className="text-emerald-700" />
                                    שלח הודעת וואטסאפ
                                  </DropdownMenuItem>
                                  {canSendZoom ? (
                                    <DropdownMenuItem
                                      onClick={() => openZoomSend(p)}
                                    >
                                      <Video className="text-sky-700" />
                                      שלח קישור לזום (מייל / וואטסאפ)
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openIssueForParticipant(p)}
                                  >
                                    <Award className="text-amber-600" />
                                    הנפקת תעודה דיגיטלית
                                  </DropdownMenuItem>
                                  {certificateUrlFor(p) ? (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        window.open(
                                          certificateUrlFor(p),
                                          "_blank",
                                          "noopener,noreferrer",
                                        )
                                      }
                                    >
                                      <FileCheck className="text-amber-500" />
                                      פתח תעודת PDF
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem
                                    onClick={() => openCertUrlEdit(p)}
                                  >
                                    <Link2
                                      className={
                                        certificateUrlFor(p)
                                          ? "text-amber-600"
                                          : "text-muted-foreground"
                                      }
                                    />
                                    {certificateUrlFor(p)
                                      ? "עריכת קישור תעודה"
                                      : "הוספת קישור תעודה"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {p.phone?.trim() ? (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        window.location.href = `tel:${p.phone}`
                                      }}
                                    >
                                      <Phone className="text-primary" />
                                      חיוג
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void toggleAttended(p, !p.attended)
                                    }
                                  >
                                    <CheckCheck
                                      className={
                                        p.attended
                                          ? "text-emerald-700"
                                          : "text-muted-foreground"
                                      }
                                    />
                                    {p.attended
                                      ? "בטל נוכחות"
                                      : "סמן נוכחות"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openEdit(p)}
                                  >
                                    <Pencil />
                                    עריכת פרטי מודרך
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setPayParticipant(p)}
                                  >
                                    <ScrollText className="text-primary" />
                                    רישום תשלום למשתתף
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openTransfer(p)}
                                  >
                                    <ArrowRightLeft className="text-primary" />
                                    העבר לקורס אחר
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteTarget(p)}
                                  >
                                    <Trash2 />
                                    מחיקת מודרך
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                        <tr className="border-0">
                          <td colSpan={10} className="p-0">
                            <div
                              className={cn(
                                "grid transition-[grid-template-rows] duration-300 ease-out",
                                open
                                  ? "grid-rows-[1fr]"
                                  : "grid-rows-[0fr]",
                              )}
                            >
                              <div className="overflow-hidden">
                                <div className="px-3 pb-3 pt-1">
                                  <TraineeContactDetailsPanel
                                    fullName={p.name}
                                    idNumber={p.idNumber}
                                    phone={p.phone}
                                    email={p.email}
                                    examScore={examScore}
                                    examPassed={
                                      p.examPassed ?? trainee?.examPassed
                                    }
                                    examCompletedAt={examCompletedAt}
                                    examDraftAnswers={
                                      p.examDraftAnswers ??
                                      trainee?.examDraftAnswers
                                    }
                                    notes={notes}
                                    extra={
                                      (p.isExternal || p.isLead) &&
                                      p.agreedPrice != null ? (
                                        <p
                                          className={cn(
                                            "text-sm font-semibold tabular-nums",
                                            isParticipantPaid(p)
                                              ? "text-emerald-700"
                                              : "text-red-600",
                                          )}
                                        >
                                          {p.isLead
                                            ? "מחיר אופציה: "
                                            : "מחיר: "}
                                          {formatCurrency(p.agreedPrice)}
                                        </p>
                                      ) : null
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
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
                      <p className="truncate text-base font-semibold text-foreground">
                        {p.name}
                      </p>
                      <ParticipantMobileMeta
                        p={p}
                        session={sessionByParticipantId.get(p.id)}
                      />
                    </button>
                    <ParticipantCertificateLinkControls
                      url={certificateUrlFor(p)}
                      name={p.name}
                      onEdit={() => openCertUrlEdit(p)}
                    />

                    <ParticipantMobileKebab
                      p={p}
                      lmsBusy={lmsBusy}
                      certificateUrl={certificateUrlFor(p)}
                      onWhatsApp={() => openWhatsApp(p)}
                      onSendZoom={
                        canSendZoom ? () => openZoomSend(p) : undefined
                      }
                      onToggleAttended={() =>
                        void toggleAttended(p, !p.attended)
                      }
                      onCreateLms={() => void createLmsUsers([p.id])}
                      onEditCertificateUrl={() => openCertUrlEdit(p)}
                      onEdit={() => openEdit(p)}
                      onPayment={() => setPayParticipant(p)}
                      onTransfer={() => openTransfer(p)}
                      onRemove={() => setDeleteTarget(p)}
                    />
                  </div>
                  {open && (
                    <div className="space-y-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                      {p.isExternal || p.isLead ? (
                        <p
                          className={`rounded-lg px-2 py-1.5 text-sm font-bold ${
                            p.agreedPrice != null && isParticipantPaid(p)
                              ? "bg-emerald-50 text-emerald-800"
                              : p.agreedPrice != null
                                ? "bg-red-50 text-red-700"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {p.isLead ? "מחיר אופציה: " : "מחיר: "}
                          {p.agreedPrice != null
                            ? formatCurrency(p.agreedPrice)
                            : "—"}
                        </p>
                      ) : null}
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span>תעודות דרך מי:</span>
                        <CertifyingBodyBadge
                          value={displayCertifyingBody({
                            certifyingBody: p.certifyingBody,
                            isExternal: p.isExternal,
                            leadCertificateDelivery: lead.certificateDelivery,
                          })}
                        />
                      </p>
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
                      {participantNotes(p) ? (
                        <p className="rounded-lg bg-secondary/50 px-2 py-1.5 text-foreground">
                          <span className="font-semibold">הערות: </span>
                          {participantNotes(p)}
                        </p>
                      ) : (
                        <p>הערות: —</p>
                      )}
                      <ExamScoreBadge
                        examScore={
                          p.examScore ?? traineeForParticipant(p)?.examScore
                        }
                        examPassed={
                          p.examPassed ?? traineeForParticipant(p)?.examPassed
                        }
                        examCompletedAt={
                          p.examCompletedAt ??
                          traineeForParticipant(p)?.examCompletedAt
                        }
                        examDraftAnswers={
                          p.examDraftAnswers ??
                          traineeForParticipant(p)?.examDraftAnswers
                        }
                      />
                      {p.isLead ? (
                        <p className="font-medium text-violet-700">★ מסומן כליד</p>
                      ) : null}
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
                      {(() => {
                        const trainee = traineeForParticipant(p)
                        return (
                          <CertificateStatusSection
                            digitalDone={Boolean(
                              trainee?.certificateEmailSent,
                            )}
                            physicalDone={Boolean(
                              trainee?.certificateCardPrinted,
                            )}
                          />
                        )
                      })()}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Dialog
        open={Boolean(editP)}
        onOpenChange={(o) => {
          if (!o && !editSaving) setEditP(null)
        }}
      >
        <DialogContent className="rounded-2xl" showCloseButton={!editSaving}>
          <DialogHeader className="text-right">
            <DialogTitle>עריכת משתתף</DialogTitle>
          </DialogHeader>
          <fieldset disabled={editSaving} className="space-y-2 border-0 p-0">
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
            <Textarea
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="הערות"
              rows={3}
              className="text-sm"
            />
            <div>
              <Label className="mb-1.5 block text-sm">תעודות דרך מי</Label>
              <Select
                value={editForm.certifyingBody || "__empty__"}
                disabled={editSaving}
                onValueChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    certifyingBody: !v || v === "__empty__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="w-full" disabled={editSaving}>
                  <SelectValue placeholder="בחירה…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">ללא</SelectItem>
                  {CERTIFYING_BODY_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={editForm.isExternal}
                disabled={editSaving}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, isExternal: Boolean(v) }))
                }
              />
              משתתף חיצוני
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={editForm.isLead}
                disabled={editSaving}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, isLead: Boolean(v) }))
                }
              />
              סמן כליד
            </label>
            {editForm.isExternal ? (
              <>
                <div>
                  <Label className="mb-1.5 block text-sm">סוג קורס</Label>
                  <Select
                    value={editForm.courseType || undefined}
                    disabled={editSaving}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, courseType: v ?? "" }))
                    }
                  >
                    <SelectTrigger className="w-full" disabled={editSaving}>
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
                    disabled={editSaving}
                    onValueChange={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        courseCategory: v ?? "",
                        courseCategoryOther:
                          v === CATEGORY_OTHER ? f.courseCategoryOther : "",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full" disabled={editSaving}>
                      <SelectValue placeholder="בחר קטגוריה" />
                    </SelectTrigger>
                    <SelectContent>
                      {editForm.courseCategory &&
                      editForm.courseCategory !== CATEGORY_OTHER &&
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
                      <SelectItem value={CATEGORY_OTHER}>
                        {CATEGORY_OTHER}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.courseCategory === CATEGORY_OTHER ? (
                  <div>
                    <Label className="mb-1.5 block text-sm">קטגוריה חדשה</Label>
                    <Input
                      value={editForm.courseCategoryOther}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          courseCategoryOther: e.target.value,
                        }))
                      }
                      placeholder="הקלידו קטגוריה מותאמת"
                    />
                  </div>
                ) : null}
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
            ) : editForm.isLead ? (
              <div>
                <Label className="mb-1.5 block text-sm">מחיר אופציה</Label>
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
            ) : null}
          </fieldset>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={editSaving}
              onClick={() => setEditP(null)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="w-full gap-2 sm:w-auto"
              disabled={editSaving}
              onClick={() => void saveEdit()}
            >
              {editSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  שומר שינויים...
                </>
              ) : (
                "שמירה"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(certUrlP)}
        onOpenChange={(open) => {
          if (!open) setCertUrlP(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>קישור תעודה</DialogTitle>
            {certUrlP ? (
              <p className="text-xs text-muted-foreground">{certUrlP.name}</p>
            ) : null}
          </DialogHeader>
          <div>
            <Label className="mb-1.5 block text-sm">
              קישור תעודה (דרייב / PDF)
            </Label>
            <Input
              value={certUrlDraft}
              onChange={(e) => setCertUrlDraft(e.target.value)}
              placeholder="https://drive.google.com/..."
              dir="ltr"
              className="text-left"
              disabled={certUrlSaving}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              בהנפקת תעודה יישלח הקובץ מהקישור הזה, כמו בניהול התעודות
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={certUrlSaving}
              onClick={() => void saveCertUrl()}
            >
              {certUrlSaving ? "שומר…" : "שמירה"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={certUrlSaving}
              onClick={() => setCertUrlP(null)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IssueCertificatesDialog
        open={issueOpen}
        onOpenChange={(o) => {
          setIssueOpen(o)
          if (!o) setIssueParticipantIds([])
        }}
        leadId={lead.id}
        participantIds={
          issueParticipantIds.length > 0
            ? issueParticipantIds
            : [...selectedIds]
        }
      />

      <ParticipantPaymentDialog
        leadId={lead.id}
        participant={payParticipant}
        open={Boolean(payParticipant)}
        onOpenChange={(o) => !o && setPayParticipant(null)}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v && !deleting) setDeleteTarget(null)
        }}
        title="אישור מחיקה"
        description={`האם אתה בטוח שאתה רוצה למחוק את ${deleteTarget?.name || "המשתתף"}?`}
        confirmLabel="אישור"
        cancelLabel="ביטול"
        confirming={deleting}
        onConfirm={confirmRemove}
      />

      <Dialog
        open={Boolean(transferP)}
        onOpenChange={(o) => {
          if (!o) {
            setTransferP(null)
            setTransferLeadId("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">
              העבר לקורס אחר
              {transferP ? ` · ${transferP.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              בחרו הדרכה בסטטוס ליד חדש או נרשם ביומן
            </p>
            {transferTargets.length === 0 ? (
              <p className="text-sm text-destructive">
                אין הדרכות זמינות להעברה כרגע
              </p>
            ) : (
              <div>
                <Label className="mb-1.5 block text-sm">הדרכת יעד</Label>
                <Select
                  value={transferLeadId || undefined}
                  onValueChange={(v) => setTransferLeadId(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="בחר הדרכה" />
                  </SelectTrigger>
                  <SelectContent>
                    {transferTargets.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {formatTrainingOptionLabel(l, settings.courses)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setTransferP(null)
                setTransferLeadId("")
              }}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={
                transferSaving ||
                !transferLeadId ||
                transferTargets.length === 0
              }
              onClick={() => void confirmTransfer()}
            >
              {transferSaving ? "מעביר…" : "העברה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
