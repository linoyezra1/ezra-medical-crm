"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createLead } from "@/lib/actions";
import { ACTIVITY_TYPES, LEAD_SOURCES } from "@/lib/constants";

export default function NewLeadPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">ליד חדש</h1>
        <p className="text-sm text-[var(--muted)]">פרטי קשר בסיסיים – את השאר תשלימו במסך הליד</p>
      </div>

      <form
        className="card-surface grid gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await createLead(fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push(`/leads/${res.data.id}`);
          });
        }}
      >
        {error && (
          <div className="rounded-xl bg-[var(--urgent-soft)] px-3 py-2 text-sm text-[var(--urgent)]">
            {error}
          </div>
        )}
        <div className="field">
          <label>שם מלא *</label>
          <input name="fullName" required autoFocus />
        </div>
        <div className="field">
          <label>טלפון *</label>
          <input name="phone" required inputMode="tel" dir="ltr" className="text-right" />
        </div>
        <div className="field">
          <label>אימייל</label>
          <input name="email" type="email" dir="ltr" className="text-right" />
        </div>
        <div className="field">
          <label>עיר</label>
          <input name="city" />
        </div>
        <div className="field">
          <label>מקור ליד</label>
          <select name="leadSource" defaultValue="">
            <option value="">—</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>סוג פעילות</label>
          <select name="activityType" defaultValue="course">
            {ACTIVITY_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>דחיפות</label>
          <select name="urgency" defaultValue="normal">
            <option value="normal">רגיל</option>
            <option value="urgent">דחוף</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "יוצר..." : "צור ליד"}
        </button>
      </form>
    </div>
  );
}
