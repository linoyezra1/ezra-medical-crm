"use client"

import { useEffect, useState } from "react"
import { ChevronDown, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Checkbox } from "@/components/ui/checkbox"
import {
  fetchLeadParticipants,
  setParticipantAttended,
} from "@/lib/actions"
import { useApp } from "@/lib/store"
import type { Lead, Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ParticipantsSection({ lead }: { lead: Lead }) {
  const { setLeadParticipants } = useApp()
  const [polling, setPolling] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const participants = lead.participants || []
  const attendedCount = participants.filter((p) => p.attended).length

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        setPolling(true)
        const rows = await fetchLeadParticipants(lead.id)
        if (!cancelled) setLeadParticipants(lead.id, rows)
      } catch {
        /* ignore transient poll errors */
      } finally {
        if (!cancelled) setPolling(false)
      }
    }
    void poll()
    const id = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [lead.id, setLeadParticipants])

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
    }
  }

  const shipping = (p: Participant) => {
    const parts = [
      p.shippingStreet,
      p.shippingHouseNo,
      p.shippingCity,
      p.shippingZip,
    ].filter(Boolean)
    return parts.length ? parts.join(", ") : "—"
  }

  return (
    <CollapsibleSection
      title="משתתפים"
      subtitle={`${participants.length} נרשמו · ${attendedCount} נוכחים`}
      defaultOpen
      action={
        <RefreshCw
          className={cn(
            "size-3.5 text-muted-foreground",
            polling && "animate-spin text-primary",
          )}
        />
      }
    >
      {participants.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          עדיין אין משתתפים — השתמשו ב״הוסף משתתפים״
        </p>
      ) : (
        <>
          {/* Mobile: names + attendance */}
          <ul className="space-y-2 md:hidden">
            {participants.map((p) => {
              const open = expandedId === p.id
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-border bg-secondary/30"
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <Checkbox
                      checked={Boolean(p.attended)}
                      onCheckedChange={(v) => toggleAttended(p, Boolean(v))}
                      aria-label={`נוכחות ${p.name}`}
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-right"
                      onClick={() => setExpandedId(open ? null : p.id)}
                    >
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <ChevronDown
                        className={cn(
                          "mr-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                  </div>
                  {open && (
                    <div className="space-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                      <Row label="ת״ז" value={p.idNumber} />
                      <Row label="טלפון" value={p.phone || "—"} />
                      <Row label="דוא״ל" value={p.email || "—"} />
                      <Row label="תאריך" value={p.courseDate || "—"} />
                      <Row label="דירוג" value={p.satisfaction || "—"} />
                      <Row label="משוב" value={p.feedback || "—"} />
                      <Row label="כתובת / מיקוד" value={shipping(p)} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 font-medium">נוכחות</th>
                  <th className="p-2 font-medium">שם מלא</th>
                  <th className="p-2 font-medium">ת״ז</th>
                  <th className="p-2 font-medium">טלפון</th>
                  <th className="p-2 font-medium">דוא״ל</th>
                  <th className="p-2 font-medium">תאריך</th>
                  <th className="p-2 font-medium">דירוג</th>
                  <th className="p-2 font-medium">משוב</th>
                  <th className="p-2 font-medium">כתובת / מיקוד</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="p-2">
                      <Checkbox
                        checked={Boolean(p.attended)}
                        onCheckedChange={(v) => toggleAttended(p, Boolean(v))}
                      />
                    </td>
                    <td className="p-2 font-medium text-foreground">{p.name}</td>
                    <td className="p-2" dir="ltr">
                      {p.idNumber}
                    </td>
                    <td className="p-2" dir="ltr">
                      {p.phone || "—"}
                    </td>
                    <td className="max-w-[140px] truncate p-2" dir="ltr">
                      {p.email || "—"}
                    </td>
                    <td className="p-2">{p.courseDate || "—"}</td>
                    <td className="p-2">{p.satisfaction || "—"}</td>
                    <td className="max-w-[160px] truncate p-2">
                      {p.feedback || "—"}
                    </td>
                    <td className="max-w-[180px] truncate p-2">{shipping(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}: </span>
      {value}
    </p>
  )
}
