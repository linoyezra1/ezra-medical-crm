"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Boxes,
  ChevronLeft,
  GraduationCap,
  Mail,
  Phone,
  User,
} from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { formatLeadCourseType } from "@/lib/course-type"
import { useApp } from "@/lib/store"
import { formatCurrency, formatDate, formatPhone } from "@/lib/helpers"

export function ClientDetailView({ id }: { id: string }) {
  const router = useRouter()
  const { getClient, leads, equipment } = useApp()
  const client = getClient(id)

  const cLeads = useMemo(
    () => leads.filter((l) => l.clientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [leads, id],
  )
  const cEquip = useMemo(
    () => equipment.filter((e) => e.clientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [equipment, id],
  )

  const revenue = useMemo(() => {
    const t = cLeads.filter((l) => l.status === "completed").reduce((s, l) => s + l.totalPrice, 0)
    const e = cEquip.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0)
    return t + e
  }, [cLeads, cEquip])

  if (!client) {
    return (
      <div>
        <PageHeader
          title="לקוח לא נמצא"
          back={
            <Button variant="ghost" size="icon" onClick={() => router.push("/clients")}>
              <ArrowRight className="size-5" />
            </Button>
          }
        />
        <p className="p-8 text-center text-sm text-muted-foreground">הלקוח המבוקש אינו קיים.</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={client.name}
        subtitle={client.city}
        back={
          <Button variant="ghost" size="icon" onClick={() => router.push("/clients")}>
            <ArrowRight className="size-5" />
          </Button>
        }
      />

      <div className="space-y-4 p-4">
        <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
          <p className="text-xs opacity-80">סך הכנסות מהלקוח</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(revenue)}</p>
          <div className="mt-3 flex gap-2">
            <a href={`tel:${client.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-foreground/15 py-2 text-sm font-medium">
              <Phone className="size-4" /> חייג
            </a>
          </div>
        </div>

        {client.contacts.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-bold text-foreground">אנשי קשר</h2>
            <div className="space-y-3">
              {client.contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                  </div>
                  <div className="flex gap-1">
                    <a href={`tel:${c.phone}`} className="rounded-lg bg-secondary p-2 text-primary">
                      <Phone className="size-4" />
                    </a>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="rounded-lg bg-secondary p-2 text-primary">
                        <Mail className="size-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <GraduationCap className="size-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">היסטוריית הדרכות ({cLeads.length})</h2>
          </div>
          <div className="space-y-2">
            {cLeads.map((l) => (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {formatLeadCourseType(l)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(l.date)} · {formatCurrency(l.totalPrice)}
                  </p>
                </div>
                <StatusBadge status={l.status} />
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Link>
            ))}
            {cLeads.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
                אין הדרכות
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Boxes className="size-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">עסקאות ציוד ({cEquip.length})</h2>
          </div>
          <div className="space-y-2">
            {cEquip.map((e) => (
              <Link
                key={e.id}
                href={`/equipment/${e.id}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(e.amount)}</p>
                </div>
                <StatusBadge status={e.status} kind="equipment" />
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Link>
            ))}
            {cEquip.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
                אין עסקאות ציוד
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
