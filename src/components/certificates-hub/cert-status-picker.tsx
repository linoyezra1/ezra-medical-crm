"use client"

import { useEffect, useState } from "react"
import { Check, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createCertificateStatusOptionAction,
  listCertificateStatusOptionsAction,
} from "@/lib/certificates-hub-actions"
import { DEFAULT_CERT_STATUS } from "@/lib/certificates-hub"
import { cn } from "@/lib/utils"

type StatusKind = "digital" | "physical"

export function CertStatusPicker({
  value,
  kind,
  onChange,
  disabled,
}: {
  value: string
  kind: StatusKind
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<string[]>([DEFAULT_CERT_STATUS])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

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
      setOptions(labels)
    })
  }, [open, kind])

  const pick = (label: string) => {
    onChange(label)
    setOpen(false)
    setAdding(false)
    setDraft("")
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
    pick(res.data.label)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "max-w-[160px] truncate rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 transition-colors",
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
            onClick={() => {
              setOpen(false)
              setAdding(false)
            }}
          />
          <div className="absolute end-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover py-1 text-sm shadow-lg">
            <ul className="max-h-48 overflow-y-auto">
              {options.map((o) => (
                <li key={o}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-right hover:bg-secondary"
                    onClick={() => pick(o)}
                  >
                    {value === o ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{o}</span>
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
          </div>
        </>
      ) : null}
    </div>
  )
}
