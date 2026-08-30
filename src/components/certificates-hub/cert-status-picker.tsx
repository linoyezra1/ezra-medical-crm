"use client"

import { useEffect, useState } from "react"
import { Check, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createCertificateStatusOptionAction,
  listCertificateStatusOptionsAction,
} from "@/lib/certificates-hub-actions"
import { DEFAULT_CERT_STATUS } from "@/lib/certificates-hub"
import { cn } from "@/lib/utils"

type StatusKind = "digital" | "physical"

export type CertStatusChangePayload = {
  status: string
  isCompleted: boolean
}

const NEW_STATUS_COMPLETED_LABEL =
  "סטטוס זה מציין סיום והשלמת התעודה (הופק/נמסר)"

export function CertStatusPicker({
  value,
  kind,
  onChange,
  disabled,
  compact,
}: {
  value: string
  kind: StatusKind
  onChange: (payload: CertStatusChangePayload) => void
  disabled?: boolean
  /** גודל קומפקטי לטבלאות */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<
    { label: string; isCompleted: boolean }[]
  >([{ label: DEFAULT_CERT_STATUS, isCompleted: false }])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [newIsCompleted, setNewIsCompleted] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void listCertificateStatusOptionsAction(
      kind === "digital" ? "DIGITAL" : "PHYSICAL",
    ).then((res) => {
      if (!res.ok) return
      let list = res.data.map((o) => ({
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
    })
  }, [open, kind, value])

  const close = () => {
    setOpen(false)
    setAdding(false)
    setDraft("")
    setNewIsCompleted(false)
  }

  const pick = (label: string, isCompleted: boolean) => {
    onChange({ status: label, isCompleted })
    close()
  }

  const saveCustom = async () => {
    const label = draft.trim()
    if (!label) return
    setBusy(true)
    const res = await createCertificateStatusOptionAction({
      label,
      type: kind === "digital" ? "DIGITAL" : "PHYSICAL",
      isCompleted: newIsCompleted,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    pick(res.data.label, res.data.isCompleted)
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
                      void saveCustom()
                    }
                  }}
                />
                <label className="flex cursor-pointer items-start gap-2 text-right text-xs leading-snug">
                  <Checkbox
                    checked={newIsCompleted}
                    onCheckedChange={(v) => setNewIsCompleted(Boolean(v))}
                    className="mt-0.5"
                  />
                  <span>{NEW_STATUS_COMPLETED_LABEL}</span>
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => void saveCustom()}
                  >
                    {busy ? "שומר…" : "שמירה"}
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
                    <li key={o.label}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-right hover:bg-secondary"
                        onClick={() => pick(o.label, o.isCompleted)}
                      >
                        {value === o.label ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        ) : (
                          <span className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
                          {o.label}
                        </span>
                      </button>
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
    </div>
  )
}
