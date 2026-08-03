"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, MessageCircle, Search } from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateTrainee } from "@/lib/actions"
import { formatPhone, whatsappLink } from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Trainee } from "@/lib/types"

function trainingLabel(t: Trainee) {
  return (
    t.trainings[0]?.organizerName ||
    t.trainings[0]?.leadName ||
    "—"
  )
}

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
      <div className="relative md:max-w-md">
        <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש מודרך / מארגן / ת״ז"
          className="h-9 pr-10 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          לא נמצאו מודרכים
        </div>
      ) : (
        <>
          {/* —— Desktop table —— */}
          <div className="hidden w-full max-w-full overflow-x-hidden md:block">
            <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[16%] px-3 py-2 font-semibold">שם מודרך</th>
                    <th className="w-[11%] px-3 py-2 font-semibold">ת״ז</th>
                    <th className="w-[12%] px-3 py-2 font-semibold">טלפון</th>
                    <th className="w-[16%] px-3 py-2 font-semibold">
                      הדרכה שיוך
                    </th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      נשלחה תעודה במייל
                    </th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      הודפס כרטיס תעודה
                    </th>
                    <th className="w-[15%] px-3 py-2 font-semibold">הערות</th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      פעולות מהירות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const via = trainingLabel(t)
                    const leadId = t.trainings[0]?.leadId
                    return (
                      <tr
                        key={t.id}
                        className="border-t border-border hover:bg-secondary/30"
                      >
                        <td className="max-w-0 truncate px-3 py-2 font-medium">
                          {t.fullName}
                        </td>
                        <td
                          className="max-w-0 truncate px-3 py-2 dir-ltr text-left"
                          dir="ltr"
                        >
                          {t.idNumber}
                        </td>
                        <td
                          className="max-w-0 truncate px-3 py-2 dir-ltr text-left"
                          dir="ltr"
                        >
                          {t.phone ? formatPhone(t.phone) : "—"}
                        </td>
                        <td className="max-w-0 truncate px-3 py-2 text-muted-foreground">
                          {via}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={t.certificateEmailSent}
                              onCheckedChange={(v) =>
                                void patch(t, {
                                  certificateEmailSent: Boolean(v),
                                })
                              }
                              aria-label="נשלחה תעודה במייל"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={t.certificateCardPrinted}
                              onCheckedChange={(v) =>
                                void patch(t, {
                                  certificateCardPrinted: Boolean(v),
                                })
                              }
                              aria-label="הודפס כרטיס תעודה"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={t.notes || ""}
                            onChange={(e) =>
                              updateTraineeLocal(t.id, {
                                notes: e.target.value,
                              })
                            }
                            onBlur={(e) =>
                              void patch(t, { notes: e.target.value })
                            }
                            placeholder="הערות"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            {t.phone && (
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
                            )}
                            {leadId && (
                              <Link
                                href={`/leads/${leadId}`}
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                                aria-label="פתח הדרכה"
                                title="פתח הדרכה"
                              >
                                <ExternalLink className="size-3.5" />
                              </Link>
                            )}
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
          <div className="space-y-2 md:hidden">
            {filtered.map((t) => {
              const open = expandedId === t.id
              const via = trainingLabel(t)
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

                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={t.certificateEmailSent}
                          onCheckedChange={(v) =>
                            void patch(t, {
                              certificateEmailSent: Boolean(v),
                            })
                          }
                        />
                        נשלחה תעודה במייל
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={t.certificateCardPrinted}
                          onCheckedChange={(v) =>
                            void patch(t, {
                              certificateCardPrinted: Boolean(v),
                            })
                          }
                        />
                        הודפס כרטיס תעודה
                      </label>
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
                      {t.trainings.map((tr) => (
                        <p
                          key={tr.participantId}
                          className="text-[11px] text-muted-foreground"
                        >
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
        </>
      )}
    </div>
  )
}
