"use client"

import { useEffect, useState } from "react"
import { Check, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  createCertificateStatusOptionAction,
  listCertificateStatusOptionsAction,
} from "@/lib/certificates-hub-actions"
import {
  DEFAULT_CERT_STATUS,
  MARK_CERTIFICATE_COMPLETED_LABEL,
} from "@/lib/certificates-hub"
import { cn } from "@/lib/utils"

type StatusKind = "digital" | "physical"

export type CertStatusChangePayload = {
  status: string
  markCompleted: boolean
}

export function CertStatusPicker({
  value,
  kind,
  onChange,
  disabled,
}: {
  value: string
  kind: StatusKind
  onChange: (payload: CertStatusChangePayload) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<string[]>([DEFAULT_CERT_STATUS])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [markCompleted, setMarkCompleted] = useState(false)

  useEffect(() => {
    if (!open) return
    void listCertificateStatusOptionsAction(
      kind === "digital" ? "DIGITAL" : "PHYSICAL",
    ).then((res) => {
      if (!res.ok) return
      const labels = res.data.map((o) => o.label)
      if (!labels.includes(DEFAULT_CERT_STATUS)) {
        labels.unshift(DEFAULT_CERT_STATUS)
      }
      if (value && !labels.includes(value)) {
        labels.push(value)
      }
      setOptions(labels)
    })
  }, [open, kind, value])

  const close = () => {
    setOpen(false)
    setAdding(false)
    setDraft("")
    setPendingLabel(null)
    setMarkCompleted(false)
  }

  const beginConfirm = (label: string) => {
    setPendingLabel(label)
    setMarkCompleted(false)
    setAdding(false)
    setDraft("")
  }

  const confirm = () => {
    if (!pendingLabel) return
    onChange({ status: pendingLabel, markCompleted })
    close()
  }

  const addCustom = async () => {
    const label = draft.trim()
    if (!label) return
    setBusy(true)
    const res = await createCertificateStatusOptionAction({
      label,
      type: "BOTH",
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setOptions((prev) =>
      prev.includes(res.data.label) ? prev : [...prev, res.data.label],
    )
    beginConfirm(res.data.label)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "min-w-[280px] max-w-md rounded-lg px-2.5 py-1.5 text-right text-[10px] font-semibold leading-snug whitespace-normal ring-1 transition-colors",
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
          <div className="absolute end-0 top-full z-50 mt-1 min-w-[280px] max-w-md overflow-hidden rounded-xl border border-border bg-popover py-1 text-sm shadow-lg">
            {pendingLabel ? (
              <div className="space-y-3 p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  סטטוס נבחר
                </p>
                <p className="whitespace-normal text-right text-sm font-medium leading-snug text-foreground">
                  {pendingLabel}
                </p>
                <label className="flex cursor-pointer items-start gap-2 text-right text-xs leading-snug">
                  <Checkbox
                    checked={markCompleted}
                    onCheckedChange={(v) => setMarkCompleted(Boolean(v))}
                    className="mt-0.5"
                  />
                  <span>{MARK_CERTIFICATE_COMPLETED_LABEL}</span>
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={confirm}
                  >
                    אישור
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPendingLabel(null)}
                  >
                    חזרה
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ul className="max-h-56 overflow-y-auto">
                  {options.map((o) => (
                    <li key={o}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-right hover:bg-secondary"
                        onClick={() => beginConfirm(o)}
                      >
                        {value === o ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        ) : (
                          <span className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 whitespace-normal leading-snug">
                          {o}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border p-2">
                  {adding ? (
                    <div className="flex gap-1">
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="סטטוס חדש…"
                        className="h-8 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            void addCustom()
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={busy}
                        onClick={() => void addCustom()}
                      >
                        שמור
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start gap-1.5 text-xs"
                      onClick={() => setAdding(true)}
                    >
                      <Plus className="size-3.5" />
                      אחר / הוסף סטטוס חדש
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
