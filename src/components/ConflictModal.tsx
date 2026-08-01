"use client";

export type ConflictItem = {
  id: string;
  courseType: string | null;
  city: string | null;
  scheduledStart: Date | string | null;
  scheduledEnd: Date | string | null;
  instructor: string | null;
  fullName: string;
};

function fmt(rangeStart: Date | string | null, rangeEnd: Date | string | null) {
  if (!rangeStart || !rangeEnd) return "—";
  const a = new Date(rangeStart);
  const b = new Date(rangeEnd);
  return `${a.toLocaleString("he-IL")} – ${b.toLocaleString("he-IL")}`;
}

type Props = {
  conflicts: ConflictItem[];
  current: {
    courseType: string;
    city: string;
    scheduledStart: string;
    scheduledEnd: string;
    instructor: string;
  };
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConflictModal({ conflicts, current, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/45 p-3">
      <div className="card-surface w-full max-w-lg p-4 shadow-xl">
        <h3 className="text-base font-extrabold text-[var(--urgent)]">
          אזהרה: זוהתה התנגשות בלוח הזמנים
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          קיים קורס בטווח הבופר (± שעה):
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {conflicts.map((c) => (
            <li key={c.id} className="rounded-xl bg-[var(--urgent-soft)] px-3 py-2">
              <div className="font-bold">
                קיים: {c.courseType || "קורס"} ב{c.city || "—"} ({fmt(c.scheduledStart, c.scheduledEnd)})
              </div>
              <div className="text-[var(--muted)]">מדריך: {c.instructor || "לא שובץ"} · {c.fullName}</div>
            </li>
          ))}
          <li className="rounded-xl bg-[var(--brand-soft)] px-3 py-2">
            <div className="font-bold">
              נוכחי: {current.courseType || "קורס"} ב{current.city || "—"} (
              {fmt(current.scheduledStart, current.scheduledEnd)})
            </div>
            <div className="text-[var(--muted)]">מדריך: {current.instructor || "לא שובץ"}</div>
          </li>
        </ul>
        <p className="mt-3 text-sm font-semibold">
          אנא ודאו ששני הקורסים משויכים למדריכים שונים.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-danger" onClick={onCancel}>
            ביטול – אל תשמור
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            אשר ושמור בכל זאת
          </button>
        </div>
      </div>
    </div>
  );
}
