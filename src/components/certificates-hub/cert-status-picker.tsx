"use client"

import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { Check, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { CertStatusCompletionDialog } from "@/components/certificates-hub/cert-status-completion-dialog"
import { CertStatusEditDialog } from "@/components/certificates-hub/cert-status-edit-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createCertificateStatusOptionAction,
  listCertificateStatusOptionsAction,
  updateCertificateStatusOptionAction,
} from "@/lib/certificates-hub-actions"
import { DEFAULT_CERT_STATUS } from "@/lib/certificates-hub"
import { cn } from "@/lib/utils"

type StatusKind = "digital" | "physical"

type StatusOption = {
  id?: string
  label: string
  isCompleted: boolean
}

export type CertStatusChangePayload = {
  status: string
  isCompleted: boolean
}

export function CertStatusPicker({
  value,
  kind,
  onChange,
  disabled,
  compact,
  onRegistryChange,
}: {
  value: string
  kind: StatusKind
  onChange: (payload: CertStatusChangePayload) => void
  disabled?: boolean
  compact?: boolean
  /** נקרא לאחר עריכת סטטוס גלובלי — לרענון ה-hub */
  onRegistryChange?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<StatusOption[]>([
    { label: DEFAULT_CERT_STATUS, isCompleted: false },
  ])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  const [completionOpen, setCompletionOpen] = useState(false)
  const [pendingLabel, setPendingLabel] = useState("")
  const [pendingApply, setPendingApply] = useState<
    ((isCompleted: boolean) => void) | null
  >(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StatusOption | null>(null)

  const statusType = kind === "digital" ? "DIGITAL" : "PHYSICAL"

  const loadOptions = useCallback(async () => {
    const res = await listCertificateStatusOptionsAction(statusType)
    if (!res.ok) return
    let list: StatusOption[] = res.data.map((o) => ({
      id: o.id,
      label: o.label,
      isCompleted: o.isCompleted,
    }))
    if (!list.some((o) => o.label === DEFAULT_CERT_STATUS)) {
      list.unshift({ label: DEFAULT_CERT_STATUS, isCompleted: false })
    }
    if (value && !list.some((o) => o.label === value)) {
      list.push({ label: value, isCompleted: false })
    }
    setOptions(list)
  }, [statusType, value])

  useEffect(() => {
    if (!open) return
    void loadOptions()
  }, [open, loadOptions])

  const close = () => {
    setOpen(false)
    setAdding(false)
    setDraft("")
  }

  const pick = (label: string, isCompleted: boolean) => {
    onChange({ status: label, isCompleted })
    close()
  }

  const promptCompletion = (
    label: string,
    onDone: (isCompleted: boolean) => void,
  ) => {
    setPendingLabel(label)
    setPendingApply(() => onDone)
    setCompletionOpen(true)
  }

  const handleCompletionConfirm = async (isCompleted: boolean) => {
    const label = pendingLabel.trim()
    if (!label || !pendingApply) return
    setBusy(true)
    const res = await createCertificateStatusOptionAction({
      label,
      type: statusType,
      isCompleted,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setCompletionOpen(false)
    setPendingApply(null)
    await loadOptions()
    pendingApply(isCompleted)
  }

  const saveCustom = () => {
    const label = draft.trim()
    if (!label) return
    const known = options.find((o) => o.label === label)
    if (known) {
      pick(known.label, known.isCompleted)
      return
    }
    promptCompletion(label, (isCompleted) => {
      pick(label, isCompleted)
    })
  }

  const openEdit = (o: StatusOption, e: MouseEvent) => {
    e.stopPropagation()
    if (!o.id) return
    setEditTarget(o)
    setEditOpen(true)
  }

  const saveEdit = async (next: { label: string; isCompleted: boolean }) => {
    if (!editTarget?.id) return
    setBusy(true)
    const res = await updateCertificateStatusOptionAction({
      id: editTarget.id,
      label: next.label,
      isCompleted: next.isCompleted,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      res.data.participantsUpdated
        ? `הסטטוס עודכן · ${res.data.participantsUpdated} משתתפים סונכרנו`
        : "הסטטוס עודכן",
    )
    setEditOpen(false)
    setEditTarget(null)
    await loadOptions()
    onRegistryChange?.()
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          compact
            ? "min-w-[130px] max-w-[150px] w-[140px] text-[10px] px-2 py-1"
            : "min-w-[300px] max-w-md w-full text-[10px] px-2.5 py-1.5",
          "rounded-lg font-semibold leading-snug break-words whitespace-normal ring-1 transition-colors text-right",
          value === DEFAULT_CERT_STATUS
            ? "bg-amber-50 text-amber-900 ring-amber-200"
            : "bg-teal-50 text-teal-900 ring-teal-200",
          disabled && "opacity-50",
        )}
        title={value}
      >
        {value || DEFAULT_CERT_STATUS}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="סגור"
            onClick={close}
          />
          <div
            className={cn(
              "absolute end-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover py-1 text-sm shadow-lg",
              compact
                ? "min-w-[280px] max-w-md w-max"
                : "min-w-[300px] max-w-md w-full",
            )}
          >
            {adding ? (
              <div className="space-y-3 p-3">
                <Label className="text-xs font-semibold">סטטוס חדש</Label>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="שם הסטטוס…"
                  className="text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      saveCustom()
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={saveCustom}
                  >
                    המשך
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setAdding(false)}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ul className="max-h-56 overflow-y-auto">
                  {options.map((o) => (
                    <li key={o.id || o.label} className="group flex">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-right hover:bg-secondary"
                        onClick={() => pick(o.label, o.isCompleted)}
                      >
                        {value === o.label ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        ) : (
                          <span className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
                          {o.label}
                          {o.isCompleted ? (
                            <span className="ms-1 text-[10px] text-emerald-700">
                              (הושלם)
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {o.id ? (
                        <button
                          type="button"
                          className="shrink-0 px-2 py-2.5 text-muted-foreground opacity-60 hover:text-primary group-hover:opacity-100"
                          aria-label={`עריכת ${o.label}`}
                          onClick={(e) => openEdit(o, e)}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-start gap-1.5 text-xs"
                    onClick={() => setAdding(true)}
                  >
                    <Plus className="size-3.5" />
                    הוסף סטטוס חדש
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      <CertStatusCompletionDialog
        open={completionOpen}
        label={pendingLabel}
        busy={busy}
        onOpenChange={(v) => {
          setCompletionOpen(v)
          if (!v) setPendingApply(null)
        }}
        onConfirm={(isCompleted) => void handleCompletionConfirm(isCompleted)}
      />

      {editTarget ? (
        <CertStatusEditDialog
          open={editOpen}
          label={editTarget.label}
          isCompleted={editTarget.isCompleted}
          busy={busy}
          onOpenChange={setEditOpen}
          onSave={(next) => void saveEdit(next)}
        />
      ) : null}
    </div>
  )
}
