"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FileSpreadsheet,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  deleteOutreachLeadAction,
  deleteOutreachTemplateAction,
  importOutreachLeadsAction,
  listOutreachLeadsAction,
  listOutreachTemplatesAction,
  upsertOutreachTemplateAction,
} from "@/lib/outreach-actions"
import {
  fillOutreachTemplate,
  parseOutreachImportFile,
  type OutreachImportRow,
} from "@/lib/outreach-import"
import { whatsappLink } from "@/lib/helpers"
import { formatPhoneDisplay } from "@/lib/utils"
import { cn } from "@/lib/utils"

type LeadRow = {
  id: string
  name: string
  phone: string
  organization: string | null
  category: string
  createdAt: string
}

type TemplateRow = {
  id: string
  category: string
  templateText: string
  updatedAt: string
}

/** אייקון WhatsApp מקורי (ירוק) */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

const DEFAULT_WA =
  "שלום {name}, כאן עזרה ורפואה. אשמח לחזור אליך לגבי {organization}."

export function OutreachLeadsView() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")

  const [templateOpen, setTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(
    null,
  )
  const [templateForm, setTemplateForm] = useState({
    category: "",
    templateText: "",
  })
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null)
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null)

  const [importPreview, setImportPreview] = useState<OutreachImportRow[] | null>(
    null,
  )
  const [importing, setImporting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [leadsRes, templatesRes] = await Promise.all([
      listOutreachLeadsAction(),
      listOutreachTemplatesAction(),
    ])
    if (leadsRes.ok) setLeads(leadsRes.data)
    else toast.error(leadsRes.error)
    if (templatesRes.ok) setTemplates(templatesRes.data)
    else toast.error(templatesRes.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const templateByCategory = useMemo(() => {
    const map = new Map<string, TemplateRow>()
    for (const t of templates) map.set(t.category.trim(), t)
    return map
  }, [templates])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) if (l.category.trim()) set.add(l.category.trim())
    for (const t of templates) if (t.category.trim()) set.add(t.category.trim())
    return [...set].sort((a, b) => a.localeCompare(b, "he"))
  }, [leads, templates])

  const filteredLeads = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return leads.filter((l) => {
      if (categoryFilter !== "all" && l.category !== categoryFilter) return false
      if (!q) return true
      const hay = `${l.name} ${l.phone} ${l.organization || ""} ${l.category}`.toLowerCase()
      return hay.includes(q)
    })
  }, [leads, filter, categoryFilter])

  const openNewTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm({ category: "", templateText: DEFAULT_WA })
    setTemplateOpen(true)
  }

  const openEditTemplate = (t: TemplateRow) => {
    setEditingTemplate(t)
    setTemplateForm({ category: t.category, templateText: t.templateText })
    setTemplateOpen(true)
  }

  const saveTemplate = async () => {
    const res = await upsertOutreachTemplateAction({
      id: editingTemplate?.id,
      category: templateForm.category,
      templateText: templateForm.templateText,
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(editingTemplate ? "התבנית עודכנה" : "התבנית נוספה")
    setTemplateOpen(false)
    void refresh()
  }

  const confirmDeleteTemplate = async () => {
    if (!deleteTemplateId) return
    const res = await deleteOutreachTemplateAction(deleteTemplateId)
    setDeleteTemplateId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("התבנית נמחקה")
    void refresh()
  }

  const confirmDeleteLead = async () => {
    if (!deleteLeadId) return
    const res = await deleteOutreachLeadAction(deleteLeadId)
    setDeleteLeadId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("הליד נמחק")
    void refresh()
  }

  const onPickFile = async (file: File | null) => {
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const rows = parseOutreachImportFile(buf)
      if (!rows.length) {
        toast.message("לא נמצאו שורות בקובץ")
        return
      }
      setImportPreview(rows)
    } catch (err) {
      console.error(err)
      toast.error("שגיאה בקריאת הקובץ")
    }
  }

  const confirmImport = async () => {
    if (!importPreview?.length) return
    const valid = importPreview.filter((r) => r.errors.length === 0)
    if (!valid.length) {
      toast.error("אין שורות תקינות לייבוא")
      return
    }
    setImporting(true)
    const res = await importOutreachLeadsAction(
      valid.map((r) => ({
        name: r.name,
        phone: r.phone,
        organization: r.organization,
        category: r.category,
      })),
    )
    setImporting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `יובאו ${res.data.imported} לידים` +
        (res.data.skipped ? ` · דולגו ${res.data.skipped}` : ""),
    )
    setImportPreview(null)
    void refresh()
  }

  const waHrefForLead = (lead: LeadRow) => {
    const tpl =
      templateByCategory.get(lead.category.trim())?.templateText || DEFAULT_WA
    const text = fillOutreachTemplate(tpl, {
      name: lead.name,
      organization: lead.organization || "",
    })
    return whatsappLink(lead.phone, text)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="לידים"
        subtitle="ייבוא לידים, תבניות וואטסאפ לפי קטגוריה ויצירת קשר מהירה"
      />

      <CollapsibleSection
        title="תבניות הודעות לפי קטגוריה"
        subtitle="Placeholders: {name} · {organization}"
        defaultOpen
        action={
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={openNewTemplate}
          >
            <Plus className="size-4" />
            תבנית חדשה
          </Button>
        }
      >
        <div className="space-y-2 p-3 pt-0">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין תבניות עדיין — הוסיפו תבנית לקטגוריה (למשל: גנים, ספקים).
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-border bg-secondary/20 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <MessageSquareText className="size-4 text-primary" />
                        {t.category}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {t.templateText}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEditTemplate(t)}
                        aria-label="עריכה"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => setDeleteTemplateId(t.id)}
                        aria-label="מחיקה"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleSection>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-1.5 rounded-xl"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" />
          ייבוא מאקסל
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] || null
            e.target.value = ""
            void onPickFile(f)
          }}
        />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="חיפוש שם / טלפון / ארגון…"
          className="max-w-xs rounded-xl"
        />
        {categories.length > 0 ? (
          <select
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <CollapsibleSection
        title={`רשימת לידים (${filteredLeads.length})`}
        alwaysOpen
      >
        <div className="overflow-x-auto p-1">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">טוען…</p>
          ) : filteredLeads.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              אין לידים להצגה — ייבאו קובץ Excel/CSV עם העמודות name, phone,
              organization, category.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full min-w-[640px] text-right text-sm md:table">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">שם</th>
                    <th className="px-3 py-2 font-semibold">טלפון</th>
                    <th className="px-3 py-2 font-semibold">ארגון</th>
                    <th className="px-3 py-2 font-semibold">קטגוריה</th>
                    <th className="px-3 py-2 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-t border-border hover:bg-secondary/30"
                    >
                      <td className="px-3 py-2.5 font-medium">{lead.name}</td>
                      <td
                        className="px-3 py-2.5 tabular-nums"
                        dir="ltr"
                      >
                        {formatPhoneDisplay(lead.phone)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {lead.organization || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          {lead.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <LeadActions
                          lead={lead}
                          waHref={waHrefForLead(lead)}
                          onDelete={() => setDeleteLeadId(lead.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <ul className="space-y-2 p-2 md:hidden">
                {filteredLeads.map((lead) => (
                  <li
                    key={lead.id}
                    className="rounded-xl border border-border bg-secondary/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {lead.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lead.organization || "ללא ארגון"} · {lead.category}
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums" dir="ltr">
                          {formatPhoneDisplay(lead.phone)}
                        </p>
                      </div>
                      <LeadActions
                        lead={lead}
                        waHref={waHrefForLead(lead)}
                        onDelete={() => setDeleteLeadId(lead.id)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </CollapsibleSection>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>
              {editingTemplate ? "עריכת תבנית" : "תבנית חדשה"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-sm">קטגוריה</Label>
              <Input
                value={templateForm.category}
                onChange={(e) =>
                  setTemplateForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder="לדוגמה: גנים"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">תוכן ההודעה</Label>
              <Textarea
                rows={5}
                value={templateForm.templateText}
                onChange={(e) =>
                  setTemplateForm((f) => ({
                    ...f,
                    templateText: e.target.value,
                  }))
                }
                placeholder="שלום {name}, לגבי {organization}…"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                אפשר להשתמש ב־{"{name}"} ו־{"{organization}"}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setTemplateOpen(false)}
            >
              ביטול
            </Button>
            <Button className="flex-1" onClick={() => void saveTemplate()}>
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(importPreview)}
        onOpenChange={(o) => !o && setImportPreview(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" />
              תצוגה מקדימה לייבוא
            </DialogTitle>
          </DialogHeader>
          {importPreview ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {importPreview.length} שורות ·{" "}
                {importPreview.filter((r) => !r.errors.length).length} תקינות
              </p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {importPreview.slice(0, 40).map((r) => (
                  <li
                    key={r.key}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-xs",
                      r.errors.length
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border",
                    )}
                  >
                    <span className="font-medium">{r.name || "—"}</span>
                    {" · "}
                    <span dir="ltr">{r.phone || "—"}</span>
                    {" · "}
                    {r.organization || "—"} · {r.category || "—"}
                    {r.errors.length ? (
                      <span className="mt-0.5 block text-destructive">
                        {r.errors.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setImportPreview(null)}
            >
              ביטול
            </Button>
            <Button
              className="flex-1"
              disabled={importing}
              onClick={() => void confirmImport()}
            >
              {importing ? "מייבא…" : "אישור ייבוא"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTemplateId)}
        onOpenChange={(o) => !o && setDeleteTemplateId(null)}
        title="מחיקת תבנית"
        description="למחוק את תבנית ההודעה? לא ניתן לשחזר."
        onConfirm={() => void confirmDeleteTemplate()}
      />
      <ConfirmDeleteDialog
        open={Boolean(deleteLeadId)}
        onOpenChange={(o) => !o && setDeleteLeadId(null)}
        title="מחיקת ליד"
        description="למחוק את הליד מרשימת השיווק?"
        onConfirm={() => void confirmDeleteLead()}
      />
    </div>
  )
}

function LeadActions({
  lead,
  waHref,
  onDelete,
}: {
  lead: LeadRow
  waHref: string
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <a
        href={`tel:${lead.phone}`}
        className="flex size-9 items-center justify-center rounded-xl text-primary hover:bg-primary/10"
        aria-label={`חיוג ל${lead.name}`}
        title="חיוג"
      >
        <Phone className="size-4" />
      </a>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-9 items-center justify-center rounded-xl text-[#25D366] hover:bg-[#25D366]/15"
        aria-label={`וואטסאפ ל${lead.name}`}
        title="וואטסאפ"
      >
        <WhatsAppIcon className="size-5" />
      </a>
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
        aria-label="מחיקה"
        title="מחיקה"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
