"use client"

import { useMemo, useState } from "react"
import { FileSpreadsheet, Layers, Stamp, Tags, X } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
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
  assignParticipantsCertifyingBodyAction,
  assignParticipantsToBatchAction,
  listCertificateBatchesAction,
  listCertificateStatusOptionsAction,
  updateParticipantCertStatusesAction,
} from "@/lib/certificates-hub-actions"
import {
  formatCertDateDisplay,
  MARK_CERTIFICATE_COMPLETED_LABEL,
  splitFullNameForExport,
  type CertificatesHubRow,
} from "@/lib/certificates-hub"
import { CERTIFYING_BODY_OPTIONS } from "@/lib/types"

export function CertificatesBulkBar({
  selectedIds,
  rowsById,
  onClear,
  onDone,
}: {
  selectedIds: Set<string>
  rowsById: Map<string, CertificatesHubRow>
  onClear: () => void
  onDone: () => void
}) {
  const count = selectedIds.size
  const [statusOpen, setStatusOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [bodyOpen, setBodyOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [statusKind, setStatusKind] = useState<"digital" | "physical">(
    "digital",
  )
  const [statusValue, setStatusValue] = useState("ממתין לתעודה")
  const [markCompleted, setMarkCompleted] = useState(false)
  const [statusOptions, setStatusOptions] = useState<string[]>([])

  const [batches, setBatches] = useState<
    { id: string; name: string; count: number }[]
  >([])
  const [batchMode, setBatchMode] = useState<"existing" | "new">("new")
  const [batchId, setBatchId] = useState("")
  const [newBatchName, setNewBatchName] = useState("")
  const [certifyingBodyValue, setCertifyingBodyValue] = useState<string>(
    CERTIFYING_BODY_OPTIONS[0],
  )

  const selectedRows = useMemo(() => {
    return [...selectedIds]
      .map((id) => rowsById.get(id))
      .filter(Boolean) as CertificatesHubRow[]
  }, [selectedIds, rowsById])

  if (count === 0) return null

  const openStatus = async () => {
    setMarkCompleted(false)
    setStatusOpen(true)
    const res = await listCertificateStatusOptionsAction()
    if (res.ok) setStatusOptions(res.data.map((o) => o.label))
  }

  const openBatch = async () => {
    setBatchOpen(true)
    const res = await listCertificateBatchesAction()
    if (res.ok) {
      setBatches(
        res.data.map((b) => ({ id: b.id, name: b.name, count: b.count })),
      )
    }
  }

  const applyStatus = async () => {
    setBusy(true)
    const res = await updateParticipantCertStatusesAction({
      participantIds: [...selectedIds],
      ...(statusKind === "digital"
        ? {
            digitalCertStatus: statusValue,
            markDigitalCompleted: markCompleted || undefined,
          }
        : {
            physicalCertStatus: statusValue,
            markPhysicalCompleted: markCompleted || undefined,
          }),
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`עודכן סטטוס ל־${res.data.updated} מודרכים`)
    setStatusOpen(false)
    onDone()
  }

  const applyBatch = async () => {
    setBusy(true)
    const sample = selectedRows[0]
    const res = await assignParticipantsToBatchAction({
      participantIds: [...selectedIds],
      ...(batchMode === "existing"
        ? { batchId }
        : {
            newBatchName,
            certifyingBody: sample?.certifyingBody,
            courseSubtype: sample?.courseSubtype,
          }),
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`שויכו למחזור «${res.data.batchName}»`)
    setBatchOpen(false)
    onDone()
  }

  const openCertifyingBody = () => {
    const sample = selectedRows[0]
    const current =
      sample?.certifyingBody &&
      sample.certifyingBody !== "ללא גוף מסמיך" &&
      CERTIFYING_BODY_OPTIONS.includes(
        sample.certifyingBody as (typeof CERTIFYING_BODY_OPTIONS)[number],
      )
        ? sample.certifyingBody
        : CERTIFYING_BODY_OPTIONS[0]
    setCertifyingBodyValue(current)
    setBodyOpen(true)
  }

  const applyCertifyingBody = async () => {
    if (!certifyingBodyValue) {
      toast.error("יש לבחור גוף מסמיך")
      return
    }
    setBusy(true)
    const res = await assignParticipantsCertifyingBodyAction({
      participantIds: [...selectedIds],
      certifyingBody: certifyingBodyValue,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `שויך «${res.data.certifyingBody}» ל־${res.data.updated} רשומות`,
    )
    setBodyOpen(false)
    onDone()
  }

  const exportExcel = () => {
    if (!selectedRows.length) return
    const data = selectedRows.map((r) => {
      const { firstName, lastName } = splitFullNameForExport(r.fullName)
      return {
        "שם פרטי": firstName,
        "שם משפחה": lastName,
        "תעודת זהות": r.idNumber,
        "הדרכת מקור": r.trainingTitle,
        תאריך: formatCertDateDisplay(r.lastSessionDate),
        "סוג תעודה": r.courseSubtype,
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "תעודות")
    const body = (selectedRows[0]?.certifyingBody || "כללי").replace(
      /[^\u0590-\u05FFa-zA-Z0-9 _+-]/g,
      "",
    )
    const subtype = (selectedRows[0]?.courseSubtype || "").replace(
      /[^\u0590-\u05FFa-zA-Z0-9 _+-]/g,
      "",
    )
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `תעודות_${body}_${subtype || "כללי"}_${date}.xlsx`)
    toast.success("קובץ האקסל הורד")
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-3 py-3 shadow-lg backdrop-blur-md md:bottom-0">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 pb-[env(safe-area-inset-bottom)]">
          <p className="text-sm font-semibold">
            נבחרו {count} מודרכים
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl"
              onClick={() => void openStatus()}
            >
              <Tags className="size-3.5" />
              שינוי סטטוס תעודה
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl"
              onClick={openCertifyingBody}
            >
              <Stamp className="size-3.5" />
              שיוך תעודות דרך מי
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl"
              onClick={() => void openBatch()}
            >
              <Layers className="size-3.5" />
              שיוך למחזור
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 rounded-xl"
              onClick={exportExcel}
            >
              <FileSpreadsheet className="size-3.5" />
              ייצוא לאקסל
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={onClear}
              aria-label="ביטול בחירה"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-right">שינוי סטטוס תעודה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-sm">סוג סטטוס</Label>
              <Select
                value={statusKind}
                onValueChange={(v) =>
                  setStatusKind(v === "physical" ? "physical" : "digital")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">תעודה דיגיטלית</SelectItem>
                  <SelectItem value="physical">תעודה פיזית</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">סטטוס</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => setStatusValue(v ?? "ממתין לתעודה")}
              >
                <SelectTrigger className="min-h-9 h-auto w-full py-2 whitespace-normal text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[280px] max-w-md">
                  {(statusOptions.length
                    ? statusOptions
                    : ["ממתין לתעודה"]
                  ).map((o) => (
                    <SelectItem
                      key={o}
                      value={o}
                      className="whitespace-normal text-right leading-snug"
                    >
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value)}
              placeholder="או הקלדת סטטוס חופשי…"
              className="text-sm"
            />
            <label className="flex cursor-pointer items-start gap-2 text-right text-sm leading-snug">
              <Checkbox
                checked={markCompleted}
                onCheckedChange={(v) => setMarkCompleted(Boolean(v))}
                className="mt-0.5"
              />
              <span>{MARK_CERTIFICATE_COMPLETED_LABEL}</span>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void applyStatus()}
            >
              {busy ? "מעדכן…" : `עדכון ${count} מודרכים`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bodyOpen} onOpenChange={setBodyOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">שיוך תעודות דרך מי</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              השיוך נשמר במשתתף ובמודרך הגלובלי — יופיע בכל המסכים (משתתפי
              הדרכה, מודרכים, תעודות).
            </p>
            <div>
              <Label className="mb-1.5 block text-sm">גוף מסמיך</Label>
              <Select
                value={certifyingBodyValue}
                onValueChange={(v) => setCertifyingBodyValue(v ?? "")}
              >
                <SelectTrigger className="min-h-9 h-auto w-full py-2 whitespace-normal text-right">
                  <SelectValue placeholder="בחר גוף מסמיך…" />
                </SelectTrigger>
                <SelectContent className="min-w-[280px] max-w-md">
                  {CERTIFYING_BODY_OPTIONS.map((o) => (
                    <SelectItem
                      key={o}
                      value={o}
                      className="whitespace-normal text-right leading-snug"
                    >
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void applyCertifyingBody()}
            >
              {busy ? "משייך…" : `שיוך ${count} מודרכים`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBodyOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">שיוך למחזור</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={batchMode === "new" ? "default" : "outline"}
                onClick={() => setBatchMode("new")}
              >
                מחזור חדש
              </Button>
              <Button
                type="button"
                size="sm"
                variant={batchMode === "existing" ? "default" : "outline"}
                onClick={() => setBatchMode("existing")}
              >
                מחזור קיים
              </Button>
            </div>
            {batchMode === "new" ? (
              <div>
                <Label className="mb-1.5 block text-sm">שם המחזור</Label>
                <Input
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  placeholder='לדוגמה: מחזור יולי 1 - ניתאי'
                />
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block text-sm">בחירת מחזור</Label>
                <Select
                  value={batchId}
                  onValueChange={(v) => setBatchId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר מחזור…" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void applyBatch()}
            >
              {busy ? "משייך…" : `שיוך ${count} מודרכים`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBatchOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
