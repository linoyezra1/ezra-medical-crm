"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, MessageCircle, Phone } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"
import { formatCurrency, formatPhone, whatsappLink } from "@/lib/helpers"
import {
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_ORDER,
  type EquipmentStatus,
} from "@/lib/types"

export function EquipmentDetailView({ id }: { id: string }) {
  const router = useRouter()
  const { equipment, updateEquipment, getClient } = useApp()
  const deal = equipment.find((e) => e.id === id)
  const [busy, setBusy] = useState(false)

  if (!deal) {
    return (
      <div>
        <PageHeader
          title="עסקה לא נמצאה"
          back={
            <Button variant="ghost" size="icon" onClick={() => router.push("/equipment")}>
              <ArrowRight className="size-5" />
            </Button>
          }
        />
      </div>
    )
  }

  const client = getClient(deal.clientId)
  const currentIndex = EQUIPMENT_STATUS_ORDER.indexOf(deal.status)
  const nextStatus = EQUIPMENT_STATUS_ORDER[currentIndex + 1] as EquipmentStatus | undefined

  const advance = () => {
    if (!nextStatus) return
    setBusy(true)
    updateEquipment(deal.id, { status: nextStatus })
    toast.success(`הסטטוס עודכן ל"${EQUIPMENT_STATUS_LABELS[nextStatus]}"`)
    setBusy(false)
  }

  return (
    <div>
      <PageHeader
        title={deal.title}
        subtitle={client?.name}
        back={
          <Button variant="ghost" size="icon" onClick={() => router.push("/equipment")}>
            <ArrowRight className="size-5" />
          </Button>
        }
      />

      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={deal.status} kind="equipment" />
            <span className="text-2xl font-bold text-foreground">{formatCurrency(deal.amount)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            תנאי תשלום: {deal.paymentTerms === "immediate" ? "מיידי" : "שוטף + 30"}
          </p>
        </div>

        {/* פעולות מהירות */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${deal.phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground active:scale-95 transition-transform"
          >
            <Phone className="size-4 text-primary" /> חייג
          </a>
          <a
            href={whatsappLink(deal.phone, `שלום ${deal.contactName}, לגבי ${deal.title}`)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground active:scale-95 transition-transform"
          >
            <MessageCircle className="size-4 text-success" /> וואטסאפ
          </a>
        </div>

        {/* צנרת סטטוס */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">התקדמות העסקה</h2>
          <ol className="space-y-2">
            {EQUIPMENT_STATUS_ORDER.map((s, i) => {
              const passed = i <= currentIndex
              return (
                <li key={s} className="flex items-center gap-3">
                  <span
                    className={
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                      (passed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")
                    }
                  >
                    {passed ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={"text-sm " + (passed ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {EQUIPMENT_STATUS_LABELS[s]}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        {deal.notes && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-bold text-foreground">הערות</h2>
            <p className="text-sm text-muted-foreground">{deal.notes}</p>
          </section>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="text-muted-foreground">איש קשר</p>
          <p className="font-medium text-foreground">{deal.contactName} · {formatPhone(deal.phone)}</p>
        </div>
      </div>

      {nextStatus && (
        <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto max-w-md px-4 md:inset-x-auto md:bottom-6 md:start-[calc(14rem+1.5rem)] md:max-w-sm">
          <Button className="h-12 w-full gap-2 text-base shadow-lg" onClick={advance} disabled={busy}>
            <Check className="size-5" />
            קדם ל"{EQUIPMENT_STATUS_LABELS[nextStatus]}"
          </Button>
        </div>
      )}
    </div>
  )
}
