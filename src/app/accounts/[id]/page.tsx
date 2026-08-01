import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { COURSE_STATUS_LABELS, type CourseStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      contacts: true,
      leads: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!account) notFound();

  const closed = account.leads.filter((l) =>
    ["closed_won", "closed", "completed", "certificates_pending"].includes(l.courseStatus)
  );

  return (
    <div className="space-y-4">
      <div>
        <Link href="/leads" className="text-xs font-semibold text-[var(--brand)]">
          ← חזרה
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">{account.name}</h1>
        <p className="text-sm text-[var(--muted)]">
          {account.classification === "returning" ? "לקוח חוזר" : "לקוח חדש"}
          {account.city ? ` · ${account.city}` : ""}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-2">
        <div className="card-surface p-3">
          <div className="text-xs text-[var(--muted)]">הזמנות סגורות</div>
          <div className="text-xl font-extrabold">{closed.length}</div>
        </div>
        <div className="card-surface p-3">
          <div className="text-xs text-[var(--muted)]">אנשי קשר</div>
          <div className="text-xl font-extrabold">{account.contacts.length}</div>
        </div>
      </section>

      <section className="card-surface p-4">
        <h2 className="font-extrabold mb-2">אנשי קשר</h2>
        <ul className="space-y-2 text-sm">
          {account.contacts.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span className="font-semibold">
                {c.fullName}
                {c.role ? ` (${c.role})` : ""}
              </span>
              <span className="text-[var(--muted)] dir-ltr">{c.phone}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-surface p-4">
        <h2 className="font-extrabold mb-2">היסטוריית הזמנות</h2>
        <ul className="space-y-2 text-sm">
          {account.leads.map((l) => (
            <li key={l.id} className="flex justify-between gap-2 border-b border-[var(--border)] pb-2">
              <div>
                <Link href={`/leads/${l.id}`} className="font-semibold text-[var(--brand)]">
                  {l.fullName}
                </Link>
                <div className="text-xs text-[var(--muted)]">
                  {COURSE_STATUS_LABELS[l.courseStatus as CourseStatus] ?? l.courseStatus}
                  {l.scheduledStart
                    ? ` · ${new Date(l.scheduledStart).toLocaleDateString("he-IL")}`
                    : ""}
                </div>
              </div>
              <div className="font-bold">{formatCurrency(l.agreedPrice)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
