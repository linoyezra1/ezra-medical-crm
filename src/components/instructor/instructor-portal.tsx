"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  MapPin,
  User,
  Wallet,
} from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatLeadCourseType } from "@/lib/course-type"
import {
  formatCurrency,
  formatDateWithWeekday,
  formatTrainingDuration,
  instructorPayAmount,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"

const STORAGE_KEY = "ezra-instructor-name"

export function InstructorTrainingsView({
  portalToken,
}: {
  portalToken: string
}) {
  void portalToken
  const { leads, settings } = useApp()
  const [name, setName] = useState("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setName(localStorage.getItem(STORAGE_KEY) || "")
    setReady(true)
  }, [])

  const saveName = (v: string) => {
    setName(v)
    localStorage.setItem(STORAGE_KEY, v.trim())
  }

  const mine = useMemo(() => {
    const n = name.trim()
    if (!n) return []
    return leads
      .filter(
        (l) =>
          l.instructor?.trim() === n &&
          ["closed", "pending_certificates"].includes(l.status),
      )
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [leads, name])

  if (!ready) return null

  return (
    <div>
      <PageHeader title="הדרכות שלי" subtitle="ממשק מדריך" />
      <div className="space-y-4 p-4">
        <Card className="space-y-2 p-4">
          <Label>שם המדריך</Label>
          <Input
            value={name}
            onChange={(e) => saveName(e.target.value)}
            placeholder="לדוגמה: יצחק"
          />
          <p className="text-[11px] text-muted-foreground">
            מוצגות הדרכות ששובצת אליהן לפי השם הזה
          </p>
        </Card>

        {!name.trim() ? (
          <p className="text-center text-sm text-muted-foreground">
            הזינו את שם המדריך כדי לראות שיבוצים
          </p>
        ) : mine.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            אין הדרכות משובצות כרגע
          </p>
        ) : (
          mine.map((lead) => {
            const pay = instructorPayAmount(lead)
            const address = [lead.address?.street, lead.address?.houseNumber]
              .filter(Boolean)
              .join(" ")
            return (
              <Link key={lead.id} href={`/instructor/${portalToken}/training/${lead.id}`}>
                <Card className="space-y-3 p-4 transition-colors hover:bg-secondary/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-right">
                      <p className="font-bold">
                        {formatLeadCourseType(lead, settings.courses)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateWithWeekday(lead.date)}
                        {lead.time
                          ? ` · ${lead.time}${lead.endTime ? `–${lead.endTime}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                      {formatCurrency(pay)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <SummaryRow
                      icon={User}
                      label="מדריך"
                      value={lead.instructor || "—"}
                    />
                    <SummaryRow
                      icon={Wallet}
                      label="משך"
                      value={formatTrainingDuration(lead)}
                    />
                    <SummaryRow
                      icon={MapPin}
                      label="עיר"
                      value={lead.address?.city || "—"}
                    />
                    <SummaryRow
                      icon={MapPin}
                      label="כתובת"
                      value={address || "—"}
                    />
                  </div>
                  <div className="rounded-xl bg-secondary/60 px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
                    פתח משתתפי הדרכה
                  </div>
                </Card>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

export function InstructorPayDashboard({
  portalToken,
}: {
  portalToken: string
}) {
  void portalToken
  const { leads } = useApp()
  const [name, setName] = useState("")

  useEffect(() => {
    setName(localStorage.getItem(STORAGE_KEY) || "")
  }, [])

  const done = useMemo(() => {
    const n = name.trim()
    if (!n) return []
    return leads.filter(
      (l) => l.instructor?.trim() === n && l.status === "pending_certificates",
    )
  }, [leads, name])

  const total = done.reduce((s, l) => s + instructorPayAmount(l), 0)

  return (
    <div>
      <PageHeader title="דשבורד שכר" subtitle={name || "מדריך"} />
      <div className="space-y-4 p-4">
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">סה״כ להדרכות שבוצעו</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {formatCurrency(total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {done.length} הדרכות
          </p>
        </Card>
        {done.map((lead) => (
          <Card
            key={lead.id}
            className="flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold">{lead.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateWithWeekday(lead.date)} · {lead.address?.city || "—"}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold">
              {formatCurrency(instructorPayAmount(lead))}
            </span>
          </Card>
        ))}
      </div>
    </div>
  )
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-secondary/40 p-2">
      <p className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
