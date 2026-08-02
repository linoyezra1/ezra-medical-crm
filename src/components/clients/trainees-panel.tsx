"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateTrainee } from "@/lib/actions"
import { useApp } from "@/lib/store"
import type { Trainee } from "@/lib/types"

export function TraineesPanel() {
  const { trainees, updateTraineeLocal } = useApp()
  const [q, setQ] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return trainees
    return trainees.filter(
      (t) =>
        t.fullName.toLowerCase().includes(term) ||
        t.idNumber.includes(term) ||
        (t.phone || "").includes(term) ||
        (t.email || "").toLowerCase().includes(term) ||
        t.trainings.some(
          (tr) =>
            (tr.organizerName || "").toLowerCase().includes(term) ||
            tr.leadName.toLowerCase().includes(term),
        ),
    )
  }, [trainees, q])

  const patch = async (t: Trainee, data: Partial<Trainee>) => {
    updateTraineeLocal(t.id, data)
    const res = await updateTrainee(t.id, {
      certificateEmailSent: data.certificateEmailSent,
      certificateCardPrinted: data.certificateCardPrinted,
      notes: data.notes,
    })
    if (!res.ok) toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש מודרך / מארגן / ת״ז"
          className="pr-10"
        />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          לא נמצאו מודרכים
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((t) => {
          const open = expandedId === t.id
          const via =
            t.trainings[0]?.organizerName ||
            t.trainings[0]?.leadName ||
            "—"
          return (
            <div
              key={t.id}
              className="rounded-2xl border border-border bg-card p-3"
            >
              <button
                type="button"
                className="w-full text-right"
                onClick={() => setExpandedId(open ? null : t.id)}
              >
                <p className="text-sm font-semibold">{t.fullName}</p>
                <p className="text-[11px] text-muted-foreground" dir="ltr">
                  {t.idNumber}
                  {t.phone ? ` · ${t.phone}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-primary">
                  הדרכה דרך: {via}
                </p>
              </button>

              {/* Desktop-focused certificate controls always visible on md+ */}
              <div className="mt-3 hidden gap-4 border-t border-border pt-3 md:grid md:grid-cols-[1fr_1fr_1.4fr]">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={t.certificateEmailSent}
                    onCheckedChange={(v) =>
                      patch(t, { certificateEmailSent: Boolean(v) })
                    }
                  />
                  נשלחה תעודה במייל
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={t.certificateCardPrinted}
                    onCheckedChange={(v) =>
                      patch(t, { certificateCardPrinted: Boolean(v) })
                    }
                  />
                  הודפס כרטיס תעודה
                </label>
                <Textarea
                  value={t.notes || ""}
                  onChange={(e) =>
                    updateTraineeLocal(t.id, { notes: e.target.value })
                  }
                  onBlur={(e) => patch(t, { notes: e.target.value })}
                  placeholder="הערות"
                  rows={2}
                  className="min-h-[56px] text-xs"
                />
              </div>

              {open && (
                <div className="mt-3 space-y-2 border-t border-border pt-3 md:hidden">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={t.certificateEmailSent}
                      onCheckedChange={(v) =>
                        patch(t, { certificateEmailSent: Boolean(v) })
                      }
                    />
                    נשלחה תעודה במייל
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={t.certificateCardPrinted}
                      onCheckedChange={(v) =>
                        patch(t, { certificateCardPrinted: Boolean(v) })
                      }
                    />
                    הודפס כרטיס תעודה
                  </label>
                  <Textarea
                    value={t.notes || ""}
                    onChange={(e) =>
                      updateTraineeLocal(t.id, { notes: e.target.value })
                    }
                    onBlur={(e) => patch(t, { notes: e.target.value })}
                    placeholder="הערות"
                    rows={2}
                    className="text-xs"
                  />
                  {t.trainings.map((tr) => (
                    <p key={tr.participantId} className="text-[11px] text-muted-foreground">
                      הדרכה דרך: {tr.organizerName || tr.leadName}
                      {tr.courseDate ? ` · ${tr.courseDate}` : ""}
                    </p>
                  ))}
                </div>
              )}

              {open && (
                <div className="mt-2 hidden space-y-1 md:block">
                  {t.trainings.map((tr) => (
                    <p key={tr.participantId} className="text-[11px] text-muted-foreground">
                      הדרכה דרך: {tr.organizerName || tr.leadName}
                      {tr.courseDate ? ` · ${tr.courseDate}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
