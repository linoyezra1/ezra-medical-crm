"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import {
  Award,
  ChevronDown,
  ChevronLeft,
  Download,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  Link2,
  MessageCircle,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Video,
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
import { TraineeAddDialog } from "@/components/clients/trainee-add-dialog"
import { TraineeAssignDialog } from "@/components/clients/trainee-assign-dialog"
import { TraineeEditDialog } from "@/components/clients/trainee-edit-dialog"
import { TraineeImportDialog } from "@/components/clients/trainee-import-dialog"
import { IssueCertificatesDialog } from "@/components/leads/issue-certificates-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteTrainee,
  sendLmsAccessToSheets,
  syncCertificatesFromSheetsAction,
  updateTrainee,
} from "@/lib/actions"
import { formatCourseTypeLabel } from "@/lib/course-type"
import { formatLeadCategory, formatPhone, whatsappLink } from "@/lib/helpers"
import {
  displayCertifyingBody,
  normalizeCertifyingBody,
} from "@/lib/certifying-body"
import {
  buildParticipantSessionNumbers,
  sortTrainingsChronologically,
} from "@/lib/participant-session"
import { pickZoomSessionForInvite } from "@/lib/payment"
import { useApp } from "@/lib/store"
import type { CertifyingBody, LeadStatus, Trainee } from "@/lib/types"
import { CERTIFYING_BODY_OPTIONS } from "@/lib/types"
import { cn } from "@/lib/utils"

type TraineeStatusFilter = "all" | "new" | "closed" | "pending_certificates"

const TRAINEE_STATUS_FILTERS: {
  value: TraineeStatusFilter
  label: string
}[] = [
  { value: "all", label: "הכל" },
  { value: "new", label: "ליד חדש" },
  { value: "closed", label: "נרשם ביומן" },
  { value: "pending_certificates", label: "ממתין לתעודות" },
]

function traineeHasLeadStatus(
  t: Trainee,
  status: LeadStatus,
  leadStatusById: Map<string, LeadStatus>,
) {
  return t.trainings.some(
    (tr) => leadStatusById.get(tr.leadId) === status,
  )
}

/** ממתין לתעודות: הדרכה בסטטוס pending_certificates, למעט מי שקיבל כבר דיגיטלית+פיזית */
function matchesPendingCertificatesSmart(
  t: Trainee,
  leadStatusById: Map<string, LeadStatus>,
) {
  if (!traineeHasLeadStatus(t, "pending_certificates", leadStatusById)) {
    return false
  }
  if (t.certificateEmailSent && t.certificateCardPrinted) return false
  return true
}

function trainingLabel(t: Trainee) {
  if (!t.trainings.length) return "—"
  const latest = t.trainings[t.trainings.length - 1]
  const name = latest.organizerName || latest.leadName || "—"
  if (t.trainings.length === 1) return name
  return `${t.trainings.length} הדרכות · ${name}`
}

function latestTraining(t: Trainee) {
  if (!t.trainings.length) return undefined
  return t.trainings[t.trainings.length - 1]
}

function traineeCourseTypeLabel(t: Trainee) {
  const raw = latestTraining(t)?.courseType
  if (!raw) return "—"
  return formatCourseTypeLabel(raw) || raw
}

function traineeCategoryLabel(t: Trainee) {
  const raw = latestTraining(t)?.courseCategory
  if (!raw) return "—"
  return formatLeadCategory(raw)
}

function traineeCertifyingBodyLabel(
  t: Trainee,
  leads: {
    id: string
    certificateDelivery?: string
    participants: {
      id: string
      certifyingBody?: string
      isExternal?: boolean
      traineeId?: string
      idNumber?: string
    }[]
  }[],
): string {
  const own = normalizeCertifyingBody(t.certifyingBody)
  if (own) return own
  for (const lead of leads) {
    for (const p of lead.participants || []) {
      const match =
        p.traineeId === t.id ||
        (p.idNumber &&
          p.idNumber.replace(/\D/g, "") === t.idNumber.replace(/\D/g, ""))
      if (!match) continue
      const label = displayCertifyingBody({
        certifyingBody: p.certifyingBody,
        isExternal: p.isExternal,
        leadCertificateDelivery: lead.certificateDelivery,
      })
      if (label) return label
    }
  }
  return ""
}

function ExternalTag() {
  return (
    <span className="shrink-0 rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-pink-700">
      חיצוני
    </span>
  )
}

export function TraineesPanel() {
  const { trainees, leads, updateTraineeLocal, refresh } = useApp()
  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] =
    useState<TraineeStatusFilter>("all")
  const [certifyingBodyFilter, setCertifyingBodyFilter] = useState<
    "all" | CertifyingBody
  >("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [editTrainee, setEditTrainee] = useState<Trainee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trainee | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [syncingSheets, setSyncingSheets] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueParticipantIds, setIssueParticipantIds] = useState<string[]>([])
  const [lmsBusyId, setLmsBusyId] = useState<string | null>(null)

  const leadStatusById = useMemo(() => {
    const map = new Map<string, LeadStatus>()
    for (const l of leads) map.set(l.id, l.status)
    return map
  }, [leads])

  const leadDateById = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const l of leads) map.set(l.id, l.date)
    return map
  }, [leads])

  const sessionByParticipantId = useMemo(
    () => buildParticipantSessionNumbers(leads),
    [leads],
  )

  const activeTrainees = useMemo(
    () => trainees.filter((t) => t.trainings.length > 0),
    [trainees],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return activeTrainees.filter((t) => {
      if (statusFilter === "pending_certificates") {
        if (!matchesPendingCertificatesSmart(t, leadStatusById)) return false
      } else if (statusFilter !== "all") {
        if (!traineeHasLeadStatus(t, statusFilter, leadStatusById)) return false
      }

      if (certifyingBodyFilter !== "all") {
        const body = traineeCertifyingBodyLabel(t, leads)
        if (body !== certifyingBodyFilter) return false
      }

      if (!term) return true
      return (
        t.fullName.toLowerCase().includes(term) ||
        t.idNumber.includes(term) ||
        (t.phone || "").includes(term) ||
        (t.email || "").toLowerCase().includes(term) ||
        t.trainings.some(
          (tr) =>
            (tr.organizerName || "").toLowerCase().includes(term) ||
            tr.leadName.toLowerCase().includes(term),
        ) ||
        (t.isExternal && "חיצוני".includes(term))
      )
    })
  }, [
    activeTrainees,
    q,
    statusFilter,
    leadStatusById,
    certifyingBodyFilter,
    leads,
  ])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const t of filtered) {
        if (checked) next.add(t.id)
        else next.delete(t.id)
      }
      return next
    })
  }

  const openAssign = (ids: string[]) => {
    if (!ids.length) {
      toast.error("יש לבחור לפחות מודרך אחד")
      return
    }
    setAssignIds(ids)
    setAssignOpen(true)
  }

  const exportSelectedExcel = () => {
    const selected = trainees.filter((t) => selectedIds.has(t.id))
    if (!selected.length) {
      toast.error("יש לבחור לפחות מודרך אחד לייצוא")
      return
    }
    const rows = selected.map((t) => {
      const tr = t.trainings[0]
      return {
        "שם מלא": t.fullName,
        "תעודת זהות": t.idNumber,
        "תאריך הדרכה": tr?.courseDate || "",
        אימייל: t.email || "",
        טלפון: t.phone || "",
        "שם מארגן הקורס":
          tr?.organizerName || tr?.leadName || "",
        "חותמת זמן": t.createdAt,
      }
    })
    const sheet = XLSX.utils.json_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "מודרכים")
    XLSX.writeFile(
      book,
      `modrachim-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
    toast.success(`יוצאו ${selected.length} מודרכים`)
  }

  const patch = async (t: Trainee, data: Partial<Trainee>) => {
    updateTraineeLocal(t.id, data)
    const res = await updateTrainee(t.id, {
      notes: data.notes,
    })
    if (!res.ok) {
      toast.error(res.error)
      refresh()
    }
  }

  const syncFromSheets = async () => {
    setSyncingSheets(true)
    const res = await syncCertificatesFromSheetsAction()
    setSyncingSheets(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `סנכרון הושלם: יוצאו ${res.data.exported} חדשים · עודכנו ${res.data.updated} מודרכים` +
        (res.data.autoCompleted
          ? ` · ${res.data.autoCompleted} הדרכות הושלמו אוטומטית`
          : ""),
    )
    refresh()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await deleteTrainee(deleteTarget.id)
    setDeleting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("המודרך נמחק לצמיתות")
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(deleteTarget.id)
      return next
    })
    setDeleteTarget(null)
    refresh()
  }

  const openIssueCertificates = () => {
    const selected = activeTrainees.filter((t) => selectedIds.has(t.id))
    if (!selected.length) {
      toast.error("יש לסמן מודרכים להפקת תעודות")
      return
    }
    const noTraining = selected.filter((t) => t.trainings.length === 0)
    if (noTraining.length) {
      toast.error(
        `המודרך ${noTraining[0].fullName} לא נכח בהדרכה, לכן לא ניתן להנפיק תעודה`,
      )
      return
    }
    const sheetIds = [
      ...new Set(
        selected.map((t) => t.trainings[0]?.participantId || t.id),
      ),
    ]
    setIssueParticipantIds(sheetIds)
    setIssueOpen(true)
  }

  const toolbar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {selectedIds.size > 0 ? (
        <span className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
          {selectedIds.size} נבחרו
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        disabled={syncingSheets}
        onClick={() => void syncFromSheets()}
        title="סנכרון סימוני תעודות מ-Google Sheets"
      >
        <RefreshCw
          className={cn("size-4", syncingSheets && "animate-spin")}
        />
        סנכרון מ-Sheets
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        onClick={() => setImportOpen(true)}
      >
        <FileSpreadsheet className="size-4" />
        ייבוא מאקסל
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-10 gap-2 rounded-xl font-bold sm:h-9"
        disabled={selectedIds.size === 0}
        onClick={openIssueCertificates}
      >
        <ScrollText className="size-4" />
        📜 הפק תעודות מרחוק
        {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        disabled={selectedIds.size === 0}
        onClick={exportSelectedExcel}
      >
        <Download className="size-4" />
        ייצוא לאקסל
        {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        onClick={() => setAddOpen(true)}
      >
        <Plus className="size-4" />
        הוספת מודרך ידנית
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2 rounded-xl sm:h-9"
        disabled={selectedIds.size === 0}
        onClick={() => openAssign([...selectedIds])}
      >
        <Link2 className="size-4" />
        שיוך לנבחרים
        {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
      </Button>
    </div>
  )

  const actionButtons = (t: Trainee, compact = false) => {
    if (compact) {
      const latest = latestTraining(t)
      const linkedLead = latest
        ? leads.find((l) => l.id === latest.leadId)
        : undefined
      const linkedParticipant = linkedLead?.participants?.find(
        (p) =>
          p.id === latest?.participantId ||
          p.traineeId === t.id ||
          (p.idNumber && p.idNumber === t.idNumber),
      )
      const canZoom = Boolean(
        linkedLead && pickZoomSessionForInvite(linkedLead),
      )
      const hasLms = Boolean(linkedParticipant?.hasLmsAccess)
      const participantId =
        linkedParticipant?.id || latest?.participantId || ""

      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={`פעולות · ${t.fullName}`}
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {participantId && !hasLms ? (
              <DropdownMenuItem
                disabled={lmsBusyId === participantId}
                onClick={() => {
                  setLmsBusyId(participantId)
                  void sendLmsAccessToSheets([participantId]).then((res) => {
                    setLmsBusyId(null)
                    if (!res.ok) {
                      toast.error(res.error)
                      return
                    }
                    toast.success(
                      res.data.message ||
                        "פרטי הגישה למערכת הלמידה נשלחו בהצלחה!",
                    )
                    refresh()
                  })
                }}
              >
                {lmsBusyId === participantId ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <UserCheck className="text-primary" />
                )}
                פתח משתמש בלמידה
              </DropdownMenuItem>
            ) : null}
            {t.phone ? (
              <DropdownMenuItem
                onClick={() =>
                  window.open(
                    whatsappLink(t.phone!),
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <MessageCircle className="text-emerald-700" />
                שלח הודעת וואטסאפ
              </DropdownMenuItem>
            ) : null}
            {canZoom && linkedParticipant ? (
              <DropdownMenuItem
                onClick={() => {
                  const session = pickZoomSessionForInvite(linkedLead!)
                  const link = session?.zoomLink?.trim()
                  if (!link || !linkedParticipant.phone?.trim()) {
                    toast.error("חסר קישור זום או טלפון למשתתף")
                    return
                  }
                  window.open(
                    whatsappLink(
                      linkedParticipant.phone,
                      `היי ${linkedParticipant.name}, קישור לזום:\n${link}`,
                    ),
                    "_blank",
                    "noopener,noreferrer",
                  )
                }}
              >
                <Video className="text-sky-700" />
                שלח קישור לזום (מייל / וואטסאפ)
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const pid = latest?.participantId || t.id
                setIssueParticipantIds([pid])
                setIssueOpen(true)
              }}
            >
              <Award className="text-amber-600" />
              הנפקת תעודה דיגיטלית
            </DropdownMenuItem>
            {t.certificateUrl?.trim() ? (
              <DropdownMenuItem
                onClick={() =>
                  window.open(
                    t.certificateUrl!.trim(),
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <FileCheck className="text-amber-500" />
                פתח תעודת PDF
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {t.phone ? (
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = `tel:${t.phone}`
                }}
              >
                <Phone className="text-primary" />
                חיוג
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => openAssign([t.id])}>
              <Link2 className="text-primary" />
              שיוך להדרכה נוספת
            </DropdownMenuItem>
            {t.trainings.length > 0 ? (
              <DropdownMenuItem
                onClick={() => {
                  const leadId =
                    t.trainings[t.trainings.length - 1]?.leadId
                  if (leadId) window.location.href = `/leads/${leadId}`
                }}
              >
                <ExternalLink />
                פתח הדרכה אחרונה
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => setEditTrainee(t)}>
              <Pencil />
              עריכת פרטי מודרך
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteTarget(t)}
            >
              <Trash2 />
              מחיקת מודרך
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <div className={cn("flex items-center gap-0.5")}>
        <button
          type="button"
          onClick={() => setEditTrainee(t)}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="עריכה"
          title="עריכה"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setDeleteTarget(t)}
          className="flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
          aria-label="מחיקה"
          title="מחיקה"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => openAssign([t.id])}
          className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
          aria-label="שיוך להדרכה"
          title="שיוך להדרכה נוספת"
        >
          <Link2 className="size-3.5" />
        </button>
        {t.phone && (
          <>
            <a
              href={`tel:${t.phone}`}
              className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
              aria-label="חיוג"
              title="חיוג"
            >
              <Phone className="size-3.5" />
            </a>
            <a
              href={whatsappLink(t.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
              aria-label="וואטסאפ"
              title="וואטסאפ"
            >
              <MessageCircle className="size-3.5" />
            </a>
          </>
        )}
        {t.certificateUrl?.trim() ? (
          <a
            href={t.certificateUrl.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-8 items-center justify-center rounded-lg text-amber-500 hover:bg-amber-50 hover:text-amber-600"
            aria-label="תעודת PDF"
            title="פתח תעודה"
            onClick={(e) => e.stopPropagation()}
          >
            <FileCheck className="size-3.5" />
          </a>
        ) : null}
        {t.trainings.length > 0 ? (
          <Link
            href={`/leads/${t.trainings[t.trainings.length - 1]?.leadId}`}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
            aria-label="פתח הדרכה אחרונה"
            title={
              t.trainings.length > 1
                ? `פתח הדרכה (${t.trainings.length} שיוכים)`
                : "פתח הדרכה"
            }
          >
            <ExternalLink className="size-3.5" />
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-3 overflow-x-hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full min-w-0 lg:max-w-md">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש מודרך / מארגן / ת״ז"
            className="h-9 pr-10 text-sm"
          />
        </div>
        {toolbar}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TRAINEE_STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-muted-foreground">
          תעודות דרך מי
        </label>
        <select
          className="h-9 max-w-full rounded-xl border border-border bg-card px-3 text-xs"
          value={certifyingBodyFilter}
          onChange={(e) =>
            setCertifyingBodyFilter(
              e.target.value === "all"
                ? "all"
                : (e.target.value as CertifyingBody),
            )
          }
          aria-label="סינון תעודות דרך מי"
        >
          <option value="all">הכל</option>
          {CERTIFYING_BODY_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {trainees.length === 0 ? (
            <div className="space-y-3">
              <p>עדיין אין מודרכים במערכת</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 rounded-xl"
                  onClick={() => setImportOpen(true)}
                >
                  <FileSpreadsheet className="size-4" />
                  ייבוא מאקסל
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl"
                  onClick={() => setAddOpen(true)}
                >
                  <UserPlus className="size-4" />
                  הוספה ידנית
                </Button>
              </div>
            </div>
          ) : statusFilter !== "all" || q.trim() ? (
            "לא נמצאו מודרכים התואמים לסינון"
          ) : (
            "לא נמצאו מודרכים"
          )}
        </div>
      ) : (
        <>
          {/* —— Desktop table —— */}
          <div className="hidden w-full max-w-full overflow-x-hidden md:block">
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-9 px-2 py-2 font-semibold">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(v) =>
                          toggleSelectAllFiltered(Boolean(v))
                        }
                        aria-label="בחר הכל"
                      />
                    </th>
                    <th className="w-[16%] px-2 py-2 font-semibold">שם מודרך</th>
                    <th className="w-[12%] px-2 py-2 font-semibold">
                      תעודות דרך מי
                    </th>
                    <th className="w-[12%] px-2 py-2 font-semibold">
                      הדרכה שיוך
                    </th>
                    <th className="w-[11%] px-2 py-2 font-semibold">סוג קורס</th>
                    <th className="w-[10%] px-2 py-2 font-semibold">קטגוריה</th>
                    <th className="w-[9%] px-2 py-2 font-semibold">
                      תעודה דיגיטלית
                    </th>
                    <th className="w-[9%] px-2 py-2 font-semibold">
                      תעודה פיזית
                    </th>
                    <th className="w-[11%] px-2 py-2 font-semibold">הערות</th>
                    <th className="w-[10%] px-2 py-2 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const via = trainingLabel(t)
                    const open = expandedId === t.id
                    return (
                      <Fragment key={t.id}>
                        <tr
                          className={cn(
                            "border-t border-border hover:bg-secondary/30",
                            selectedIds.has(t.id) && "bg-primary/5",
                            open && "bg-secondary/20",
                          )}
                        >
                          <td className="px-2 py-2">
                            <Checkbox
                              checked={selectedIds.has(t.id)}
                              onCheckedChange={(v) =>
                                toggleSelected(t.id, Boolean(v))
                              }
                              aria-label={`בחירה ${t.fullName}`}
                            />
                          </td>
                          <td className="max-w-0 px-2 py-2 font-medium">
                            <button
                              type="button"
                              className="block w-full min-w-0 text-right hover:text-primary"
                              onClick={() =>
                                setExpandedId(open ? null : t.id)
                              }
                              aria-expanded={open}
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                {open ? (
                                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                                )}
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {t.fullName}
                                </span>
                                {t.isExternal ? <ExternalTag /> : null}
                              </span>
                            </button>
                          </td>
                          <td className="max-w-0 truncate px-2 py-2">
                            <CertifyingBodyBadge
                              value={traineeCertifyingBodyLabel(t, leads)}
                            />
                          </td>
                          <td
                            className="max-w-0 truncate px-2 py-2 text-muted-foreground"
                            title={via}
                          >
                            {via}
                          </td>
                          <td
                            className="max-w-0 truncate px-2 py-2 text-muted-foreground"
                            title={traineeCourseTypeLabel(t)}
                          >
                            {traineeCourseTypeLabel(t)}
                          </td>
                          <td
                            className="max-w-0 truncate px-2 py-2 text-muted-foreground"
                            title={traineeCategoryLabel(t)}
                          >
                            {traineeCategoryLabel(t)}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center">
                              <CertificateStatusBadge
                                kind="digital"
                                done={t.certificateEmailSent}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center">
                              <CertificateStatusBadge
                                kind="physical"
                                done={t.certificateCardPrinted}
                              />
                            </div>
                          </td>
                          <td
                            className="max-w-0 truncate px-2 py-2 text-xs text-muted-foreground"
                            title={t.notes || undefined}
                          >
                            {t.notes?.trim() || "—"}
                          </td>
                          <td className="px-2 py-2">
                            {actionButtons(t, true)}
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
                                    fullName={t.fullName}
                                    idNumber={t.idNumber}
                                    phone={t.phone}
                                    email={t.email}
                                    examScore={t.examScore}
                                    examPassed={t.examPassed}
                                    examCompletedAt={t.examCompletedAt}
                                    examDraftAnswers={t.examDraftAnswers}
                                    notes={t.notes}
                                    notesEditable
                                    onNotesChange={(value) =>
                                      updateTraineeLocal(t.id, {
                                        notes: value,
                                      })
                                    }
                                    onNotesBlur={(value) =>
                                      void patch(t, { notes: value })
                                    }
                                    extra={
                                      t.trainings.length > 0 ? (
                                        <div className="space-y-1">
                                          {sortTrainingsChronologically(
                                            t.trainings,
                                            leadDateById,
                                          ).map((tr) => (
                                            <p
                                              key={tr.participantId}
                                              className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
                                            >
                                              <SessionMeetingBadge
                                                session={sessionByParticipantId.get(
                                                  tr.participantId,
                                                )}
                                              />
                                              <span>
                                                הדרכה דרך:{" "}
                                                {tr.organizerName ||
                                                  tr.leadName}
                                                {tr.courseDate ||
                                                leadDateById.get(tr.leadId)
                                                  ? ` · ${tr.courseDate || leadDateById.get(tr.leadId)}`
                                                  : ""}
                                              </span>
                                            </p>
                                          ))}
                                        </div>
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
          <div className="space-y-2 md:hidden">
            {filtered.map((t) => {
              const open = expandedId === t.id
              const via = trainingLabel(t)
              const selected = selectedIds.has(t.id)
              return (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-2xl border border-border bg-card p-3",
                    selected && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(v) =>
                        toggleSelected(t.id, Boolean(v))
                      }
                      aria-label={`בחירה ${t.fullName}`}
                      className="mt-1"
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-right"
                      onClick={() => setExpandedId(open ? null : t.id)}
                    >
                      <p className="truncate text-base font-semibold text-foreground">
                        {t.fullName}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span dir="ltr" className="tabular-nums">
                          {t.idNumber}
                        </span>
                        {t.isExternal ? <ExternalTag /> : null}
                      </p>
                      <p className="mt-1 text-[11px] text-primary">
                        הדרכה דרך: {via}
                      </p>
                      <div className="mt-1">
                        <CertifyingBodyBadge
                          value={traineeCertifyingBodyLabel(t, leads)}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        סוג קורס: {traineeCourseTypeLabel(t)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        קטגוריה: {traineeCategoryLabel(t)}
                      </p>
                      {t.email ? (
                        <p
                          className="mt-0.5 truncate text-[11px] text-muted-foreground"
                          dir="ltr"
                        >
                          {t.email}
                        </p>
                      ) : null}
                    </button>
                  </div>

                  <div className="mt-2 flex justify-end border-t border-border pt-2">
                    {actionButtons(t)}
                  </div>

                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="text-[11px] text-muted-foreground">
                        סוג קורס: {traineeCourseTypeLabel(t)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        קטגוריה: {traineeCategoryLabel(t)}
                      </p>
                      <CertificateStatusSection
                        digitalDone={t.certificateEmailSent}
                        physicalDone={t.certificateCardPrinted}
                      />
                      <ExamScoreBadge
                        examScore={t.examScore}
                        examPassed={t.examPassed}
                        examCompletedAt={t.examCompletedAt}
                        examDraftAnswers={t.examDraftAnswers}
                      />
                      <Textarea
                        value={t.notes || ""}
                        onChange={(e) =>
                          updateTraineeLocal(t.id, { notes: e.target.value })
                        }
                        onBlur={(e) => void patch(t, { notes: e.target.value })}
                        placeholder="הערות"
                        rows={2}
                        className="text-xs"
                      />
                      {sortTrainingsChronologically(
                        t.trainings,
                        leadDateById,
                      ).map((tr) => (
                        <p
                          key={tr.participantId}
                          className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
                        >
                          <SessionMeetingBadge
                            session={sessionByParticipantId.get(
                              tr.participantId,
                            )}
                          />
                          <span>
                            הדרכה דרך: {tr.organizerName || tr.leadName}
                            {tr.courseDate || leadDateById.get(tr.leadId)
                              ? ` · ${tr.courseDate || leadDateById.get(tr.leadId)}`
                              : ""}
                            {tr.courseType
                              ? ` · ${formatCourseTypeLabel(tr.courseType)}`
                              : ""}
                            {tr.courseCategory
                              ? ` · ${formatLeadCategory(tr.courseCategory)}`
                              : ""}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <TraineeImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <TraineeAddDialog open={addOpen} onOpenChange={setAddOpen} />
      <TraineeEditDialog
        trainee={editTrainee}
        open={Boolean(editTrainee)}
        onOpenChange={(v) => {
          if (!v) setEditTrainee(null)
        }}
      />
      <TraineeAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        traineeIds={assignIds}
        onAssigned={() => setSelectedIds(new Set())}
      />
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        title="אישור מחיקה"
        description="האם אתה בטוח שברצונך למחוק מודרך זה? המודרך ימחק לצמיתות גם מההדרכה המשויכת."
        confirmLabel="אישור מחיקה"
        cancelLabel="ביטול"
        confirming={deleting}
        onConfirm={confirmDelete}
      />
      <IssueCertificatesDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        participantIds={issueParticipantIds}
      />
    </div>
  )
}
