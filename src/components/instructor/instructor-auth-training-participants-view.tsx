"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2, RefreshCw, UserRound } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fetchLeadParticipants } from "@/lib/actions"
import { formatPhone } from "@/lib/helpers"
import type { Participant } from "@/lib/types"
import { cn } from "@/lib/utils"

/** תצוגת ת״ז מלאה או ממוסכת חלקית */
function formatIdNumber(idNumber: string | undefined): string {
  const raw = (idNumber || "").trim()
  if (!raw) return "—"
  if (raw.length <= 4) return raw
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`
}

export function InstructorAuthTrainingParticipantsView({
  leadId,
}: {
  leadId: string
}) {
  const [loading, setLoading] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchLeadParticipants(leadId)
      setParticipants(rows)
    } catch {
      toast.error("שגיאה בטעינת משתתפים")
      setParticipants([])
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/instructor/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            <ArrowRight className="size-4" />
            חזרה
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 rounded-full"
            aria-label="רענון"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("size-5", loading && "animate-spin")} />
          </Button>
        </div>
      </header>

      <div className="space-y-3 p-4 pb-8">
        <PageHeader
          title="רשימת משתתפים"
          subtitle={`${participants.length} משתתפים · לתצוגה בלבד במהלך ההדרכה`}
        />

        {loading ? (
          <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            טוען…
          </Card>
        ) : participants.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            אין משתתפים רשומים להדרכה זו
          </Card>
        ) : (
          <ul className="space-y-2">
            {participants.map((p, index) => (
              <li key={p.id}>
                <Card className="gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-right">
                      <p className="flex items-center justify-end gap-1.5 text-sm font-bold">
                        <span className="text-xs font-normal text-muted-foreground">
                          {index + 1}.
                        </span>
                        {p.name || "—"}
                      </p>
                      <dl className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        <div className="flex items-center justify-end gap-2">
                          <dd className="font-medium text-foreground" dir="ltr">
                            {formatIdNumber(p.idNumber)}
                          </dd>
                          <dt>ת״ז</dt>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <dd className="font-medium text-foreground" dir="ltr">
                            {p.phone ? formatPhone(p.phone) : "—"}
                          </dd>
                          <dt>טלפון</dt>
                        </div>
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <UserRound className="size-4 text-muted-foreground" />
                      {p.isExternal ? (
                        <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                          חיצוני
                        </span>
                      ) : null}
                      {p.isLead ? (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          אופציה
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
