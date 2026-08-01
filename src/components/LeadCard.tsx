import Link from "next/link";
import { COURSE_STATUS_LABELS, type CourseStatus } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";

type LeadCardProps = {
  id: string;
  fullName: string;
  phone: string;
  city: string | null;
  courseStatus: string;
  urgency: string;
  agreedPrice: number | null;
  courseType: string | null;
  scheduledStart: Date | string | null;
};

export function LeadCard(lead: LeadCardProps) {
  const urgent = lead.urgency === "urgent";
  const statusLabel =
    COURSE_STATUS_LABELS[lead.courseStatus as CourseStatus] ?? lead.courseStatus;
  const when = lead.scheduledStart
    ? new Date(lead.scheduledStart).toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={cn(
        "card-surface block p-4 transition hover:shadow-sm",
        urgent && "border-[var(--urgent)] bg-[var(--urgent-soft)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base">{lead.fullName}</h3>
            {urgent && (
              <span className="rounded-md bg-[var(--urgent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                דחוף
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[var(--muted)] dir-ltr text-right">{lead.phone}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {[lead.city, lead.courseType].filter(Boolean).join(" · ") || "ללא פרטי קורס"}
          </p>
        </div>
        <div className="text-left shrink-0">
          <span className="inline-block rounded-lg bg-[var(--brand-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--brand-dark)]">
            {statusLabel}
          </span>
          {lead.agreedPrice != null && (
            <div className="mt-2 text-sm font-bold">{formatCurrency(lead.agreedPrice)}</div>
          )}
        </div>
      </div>
      {when && <div className="mt-3 text-xs text-[var(--muted)]">מועד: {when}</div>}
    </Link>
  );
}
