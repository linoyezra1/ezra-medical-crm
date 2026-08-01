import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { SCHEDULED_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });

  const [closedCount, pipelineCount, paidLeads, expenses, recentTasks] = await Promise.all([
    prisma.lead.count({
      where: { courseStatus: { in: ["closed", "completed", "certificates_pending", "closed_won"] } },
    }),
    prisma.lead.count({
      where: { courseStatus: { in: ["new", "cold", "pending"] } },
    }),
    prisma.lead.findMany({
      where: { paymentStatus: "paid_in_full" },
      select: { agreedPrice: true },
    }),
    prisma.expense.findMany({ select: { amount: true } }),
    prisma.followUpTask.findMany({
      where: { completed: false },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { lead: { select: { id: true, fullName: true } } },
    }),
  ]);

  const income = paidLeads.reduce((s, l) => s + (l.agreedPrice ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const net = income - totalExpenses;

  const scheduledSoon = await prisma.lead.findMany({
    where: {
      courseStatus: { in: [...SCHEDULED_STATUSES] },
      scheduledStart: { gte: new Date() },
    },
    orderBy: { scheduledStart: "asc" },
    take: 5,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">לוח בקרה</h1>
        <p className="text-sm text-[var(--muted)]">{settings?.businessName ?? "עזרא ורפואה"}</p>
      </div>

      <SocialShareButtons
        tiktokUrl={settings?.tiktokUrl}
        facebookUrl={settings?.facebookUrl}
        instagramUrl={settings?.instagramUrl}
      />

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="קורסים סגורים" value={String(closedCount)} />
        <Stat label="בפייפליין" value={String(pipelineCount)} />
        <Stat label="הכנסות שנגבו" value={formatCurrency(income)} />
        <Stat label="רווח נקי" value={formatCurrency(net)} accent={net >= 0 ? "good" : "bad"} />
      </section>

      <section className="card-surface p-4 space-y-2">
        <h2 className="font-extrabold">סיכום P&amp;L</h2>
        <Row label="סה״כ הכנסות שהתקבלו" value={formatCurrency(income)} />
        <Row label="סה״כ הוצאות קורסים" value={formatCurrency(totalExpenses)} />
        <Row label="רווח נקי" value={formatCurrency(net)} bold />
      </section>

      <section className="card-surface p-4">
        <h2 className="font-extrabold mb-2">קורסים קרובים</h2>
        {scheduledSoon.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין קורסים מתוזמנים</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {scheduledSoon.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 border-b border-[var(--border)] pb-2">
                <a href={`/leads/${l.id}`} className="font-semibold text-[var(--brand)]">
                  {l.fullName}
                </a>
                <span className="text-[var(--muted)] text-xs">
                  {l.scheduledStart
                    ? new Date(l.scheduledStart).toLocaleString("he-IL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-surface p-4">
        <h2 className="font-extrabold mb-2">משימות מעקב (Net+)</h2>
        {recentTasks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין משימות פתוחות</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentTasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.title}</div>
                  {t.lead && (
                    <a href={`/leads/${t.lead.id}`} className="text-xs text-[var(--brand)]">
                      {t.lead.fullName}
                    </a>
                  )}
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {new Date(t.dueDate).toLocaleDateString("he-IL")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "bad";
}) {
  return (
    <div className="card-surface p-3">
      <div className="text-[11px] font-semibold text-[var(--muted)]">{label}</div>
      <div
        className={`mt-1 text-lg font-extrabold ${
          accent === "good" ? "text-[var(--success)]" : accent === "bad" ? "text-[var(--urgent)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${bold ? "font-extrabold pt-2 border-t border-[var(--border)]" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
