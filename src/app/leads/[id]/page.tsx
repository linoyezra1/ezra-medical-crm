import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { QuickActionsBar } from "@/components/QuickActionsBar";
import { LeadForm } from "@/components/LeadForm";
import { LinkAccountForm } from "@/components/LinkAccountForm";
import { COURSE_STATUS_LABELS, type CourseStatus } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      participants: { orderBy: { createdAt: "asc" } },
      expenses: { orderBy: { createdAt: "desc" } },
      account: true,
      tasks: { where: { completed: false }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!lead) notFound();

  const asset = lead.courseType
    ? await prisma.courseAsset.findUnique({ where: { courseType: lead.courseType } })
    : null;

  const pastOrders = lead.accountId
    ? await prisma.lead.findMany({
        where: {
          accountId: lead.accountId,
          id: { not: lead.id },
          courseStatus: { in: ["closed_won", "closed", "completed", "certificates_pending"] },
        },
        orderBy: { scheduledStart: "desc" },
        take: 10,
      })
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/leads" className="text-xs font-semibold text-[var(--brand)]">
            ← חזרה ללידים
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{lead.fullName}</h1>
          <p className="text-sm text-[var(--muted)]">
            {COURSE_STATUS_LABELS[lead.courseStatus as CourseStatus] ?? lead.courseStatus}
            {lead.city ? ` · ${lead.city}` : ""}
            {lead.agreedPrice != null ? ` · ${formatCurrency(lead.agreedPrice)}` : ""}
          </p>
        </div>
        {lead.urgency === "urgent" && (
          <span className="rounded-lg bg-[var(--urgent)] px-2 py-1 text-xs font-bold text-white">
            דחוף
          </span>
        )}
      </div>

      <QuickActionsBar lead={lead} asset={asset} />

      {lead.account ? (
        <section className="card-surface p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-[var(--muted)]">חשבון לקוח</div>
              <Link href={`/accounts/${lead.account.id}`} className="font-bold text-[var(--brand)]">
                {lead.account.name}
              </Link>
              <span className="ms-2 text-xs text-[var(--muted)]">
                ({lead.account.classification === "returning" ? "חוזר" : "חדש"})
              </span>
            </div>
          </div>
          {pastOrders.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
              {pastOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/leads/${o.id}`} className="text-xs text-[var(--muted)] hover:text-[var(--brand)]">
                    {o.scheduledStart
                      ? new Date(o.scheduledStart).toLocaleDateString("he-IL")
                      : "ללא תאריך"}{" "}
                    · {o.courseType || o.activityType} · {formatCurrency(o.agreedPrice)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <LinkAccountForm leadId={lead.id} />
      )}

      {lead.tasks.length > 0 && (
        <section className="card-surface p-3">
          <h2 className="text-sm font-extrabold mb-2">משימות מעקב</h2>
          <ul className="space-y-2 text-sm">
            {lead.tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">{t.title}</span>
                  <span className="text-[var(--muted)] text-xs">
                    {new Date(t.dueDate).toLocaleString("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {t.assignee && (
                  <div className="mt-1 text-xs text-[var(--muted)]">אחראי: {t.assignee}</div>
                )}
                {t.notes && <div className="mt-0.5 text-xs">{t.notes}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <LeadForm lead={lead} />
    </div>
  );
}
