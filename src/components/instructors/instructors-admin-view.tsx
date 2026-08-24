"use client"

import { useEffect, useState } from "react"
import { MessageCircle, Pencil, Plus, UserRound } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { InstructorAdminModal } from "@/components/instructors/instructor-admin-modal"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  fetchInstructorsAdmin,
  type InstructorAdminRow,
} from "@/lib/instructor-actions"
import { formatCurrency } from "@/lib/helpers"
import { buildInstructorCredentialsWhatsApp } from "@/lib/instructor-portal-urls"
import { whatsappLink } from "@/lib/helpers"

export function InstructorsAdminView() {
  const [rows, setRows] = useState<InstructorAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<InstructorAdminRow | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetchInstructorsAdmin()
    setLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setRows(res.data)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setEditRow(null)
    setModalOpen(true)
  }

  const openEdit = (row: InstructorAdminRow) => {
    setEditRow(row)
    setModalOpen(true)
  }

  const sendWhatsApp = (row: InstructorAdminRow) => {
    if (!row.phone?.trim()) {
      toast.error("יש להגדיר טלפון למדריך לפני שליחה")
      return
    }
    if (!row.username || !row.password) {
      toast.error("יש להגדיר שם משתמש וסיסמה לפני שליחה")
      return
    }
    const text = buildInstructorCredentialsWhatsApp({
      name: row.name,
      username: row.username,
      password: row.password,
      origin: typeof window !== "undefined" ? window.location.origin : undefined,
    })
    window.open(whatsappLink(row.phone, text), "_blank", "noopener,noreferrer")
  }

  return (
    <div>
      <PageHeader
        title="ניהול מדריכים"
        subtitle="פרופילים, גישה לאזור האישי ועמלות מכירה"
        action={
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            מדריך חדש
          </Button>
        }
      />

      <div className="space-y-3 p-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">טוען…</p>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            עדיין אין מדריכים — הוסיפו מדריך ראשון
          </Card>
        ) : (
          rows.map((row) => (
            <Card key={row.id} className="gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-right">
                  <p className="flex items-center justify-end gap-2 font-bold">
                    <UserRound className="size-4 text-primary" />
                    {row.name}
                    {!row.active && (
                      <span className="text-xs font-normal text-muted-foreground">
                        (לא פעיל)
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    שכר: {formatCurrency(row.fee)} · עמלה:{" "}
                    {row.salesCommissionPercentage}% · מוצרים למכירה:{" "}
                    {row.allowedEquipmentIds?.length ?? 0}
                  </p>
                  {row.username && (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      @{row.username}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 rounded-xl"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="size-3.5" />
                    עריכה
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 rounded-xl text-green-700"
                    onClick={() => sendWhatsApp(row)}
                  >
                    <MessageCircle className="size-3.5" />
                    שלח פרטי גישה
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <InstructorAdminModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        existing={editRow}
        onSaved={() => {
          setModalOpen(false)
          void load()
        }}
      />
    </div>
  )
}
