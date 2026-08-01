"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateAccountForLead } from "@/lib/actions";

export function LinkAccountForm({ leadId }: { leadId: string }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      className="card-surface flex flex-col gap-2 p-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await getOrCreateAccountForLead(leadId, name);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="field flex-1">
        <label>שיוך לחשבון ארגון</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="לדוגמה: מרכז קהילתי שדמות"
          required
        />
      </div>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        שייך חשבון
      </button>
      {error && <p className="text-xs text-[var(--urgent)] sm:col-span-2">{error}</p>}
    </form>
  );
}
