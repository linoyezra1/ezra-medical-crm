import Link from "next/link";
import { prisma } from "@/lib/db";
import { LeadCard } from "@/components/LeadCard";
import { COURSE_STATUSES, COURSE_STATUS_LABELS, type CourseStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string; q?: string }>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = params.status;
  const q = params.q?.trim();

  const leads = await prisma.lead.findMany({
    where: {
      ...(status ? { courseStatus: status } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { phone: { contains: q } },
              { city: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ urgency: "desc" }, { updatedAt: "desc" }],
  });

  const counts = await prisma.lead.groupBy({
    by: ["courseStatus"],
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.courseStatus, c._count]));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">לידים וקורסים</h1>
          <p className="text-sm text-[var(--muted)]">{leads.length} רשומות</p>
        </div>
      </div>

      <form className="card-surface flex gap-2 p-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="חיפוש שם / טלפון / עיר"
          className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button className="btn btn-secondary text-sm" type="submit">
          חפש
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip href="/leads" active={!status} label={`הכל (${Object.values(countMap).reduce((a, b) => a + b, 0)})`} />
        {COURSE_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/leads?status=${s}`}
            active={status === s}
            label={`${COURSE_STATUS_LABELS[s as CourseStatus]} (${countMap[s] ?? 0})`}
          />
        ))}
      </div>

      <div className="space-y-2">
        {leads.length === 0 && (
          <div className="card-surface p-8 text-center text-[var(--muted)]">
            אין לידים עדיין.{" "}
            <Link href="/leads/new" className="font-bold text-[var(--brand)] underline">
              צרו ליד ראשון
            </Link>
          </div>
        )}
        {leads.map((lead) => (
          <LeadCard key={lead.id} {...lead} />
        ))}
      </div>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border ${
        active
          ? "bg-[var(--brand)] text-white border-[var(--brand)]"
          : "bg-white text-[var(--muted)] border-[var(--border)]"
      }`}
    >
      {label}
    </Link>
  );
}
