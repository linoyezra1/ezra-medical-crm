"use client"

import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { formatTrainingOptionLabel } from "@/components/clients/training-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  assignCourseInquiryToLead,
  deleteCourseInquiry,
  type CourseInquiryRow,
} from "@/lib/actions"
import { formatDate } from "@/lib/helpers"
import { useApp } from "@/lib/store"

export function InquiriesView({
  initialRows,
}: {
  initialRows: CourseInquiryRow[]
}) {
  const { leads, settings, refresh } = useApp()
  const [rows, setRows] = useState(initialRows)
  const [query, setQuery] = useState("")
  const [assigning, setAssigning] = useState<CourseInquiryRow | null>(null)
  const [leadId, setLeadId] = useState("")
  const [saving, setSaving] = useState(false)

  const targets = useMemo(
    () =>
      leads
        .filter((l) => l.status === "new" || l.status === "closed")
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [leads],
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return rows
    return rows.filter((row) =>
      [row.fullName, row.phone, row.city, row.notes].some((value) =>
        value.includes(q),
      ),
    )
  }, [rows, query])

  const confirmAssign = async () => {
    if (!assigning) return
    if (!leadId) {
      toast.error("יש לבחור הדרכה")
      return
    }
    setSaving(true)
    const res = await assignCourseInquiryToLead(assigning.id, leadId)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setRows((prev) => prev.filter((row) => row.id !== assigning.id))
    setAssigning(null)
    setLeadId("")
    toast.success("המתעניין שויך להדרכה")
    refresh()
  }

  const remove = async (row: CourseInquiryRow) => {
    if (!window.confirm(`למחוק את ${row.fullName} מרשימת המתעניינים?`)) return
    const res = await deleteCourseInquiry(row.id)
    if (!res.ok) {
      toast.error(res.error || "לא ניתן למחוק")
      return
    }
    setRows((prev) => prev.filter((item) => item.id !== row.id))
    toast.success("המתעניין הוסר")
  }

  return (
    <div>
      <PageHeader
        title="מתעניינים"
        subtitle={`${filtered.length} באוויר`}
      />
      <div className="space-y-3 p-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון, עיר או הערות"
        />
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            אין מתעניינים באוויר. אפשר להוסיף מהכפתור הוורוד בדשבורד או בלידים,
            ולבחור «השאר באוויר».
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{row.fullName}</p>
                    <p className="text-sm text-muted-foreground" dir="ltr">
                      {row.phone || "—"}
                    </p>
                    <p className="text-sm">{row.city || "ללא עיר"}</p>
                    {row.notes ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.notes}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setAssigning(row)
                        setLeadId("")
                      }}
                    >
                      שייך להדרכה
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="מחיקה"
                      onClick={() => void remove(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(assigning)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigning(null)
            setLeadId("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">
              שיוך להדרכה
              {assigning ? ` · ${assigning.fullName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              ליד חדש או הדרכה שנרשמה ביומן
            </p>
            {targets.length === 0 ? (
              <p className="text-sm text-destructive">
                אין כרגע הדרכות זמינות לשיוך
              </p>
            ) : (
              <div>
                <Label className="mb-1.5 block text-sm">הדרכה</Label>
                <Select
                  value={leadId || undefined}
                  onValueChange={(value) => setLeadId(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="בחר הדרכה" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {formatTrainingOptionLabel(lead, settings.courses)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setAssigning(null)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={saving || !leadId}
              onClick={() => void confirmAssign()}
            >
              {saving ? "משייך…" : "שיוך"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
