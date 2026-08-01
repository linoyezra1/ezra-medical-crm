"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkDuplicatePhone, createLead } from "@/lib/actions";
import { ACTIVITY_TYPES, LEAD_SOURCES } from "@/lib/constants";
import { cn, sanitizePhone } from "@/lib/utils";

export default function NewLeadPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; fullName: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [liveDuplicates, setLiveDuplicates] = useState<{ id: string; fullName: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const cleaned = sanitizePhone(phone);
      if (cleaned.length < 9) {
        setLiveDuplicates([]);
        return;
      }
      const res = await checkDuplicatePhone(cleaned);
      setLiveDuplicates(res.duplicates);
    }, 350);
    return () => clearTimeout(t);
  }, [phone]);

  function validateClient(): boolean {
    const next: { fullName?: string; phone?: string } = {};
    if (!fullName.trim()) next.fullName = "שדה חובה";
    if (!sanitizePhone(phone)) next.phone = "שדה חובה";
    setFieldErrors(next);
    return !next.fullName && !next.phone;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">ליד חדש</h1>
        <p className="text-sm text-[var(--muted)]">פרטי קשר בסיסיים – את השאר תשלימו במסך הליד</p>
      </div>

      <form
        className="card-surface grid gap-3 p-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setDuplicate(null);
          if (!validateClient()) {
            setError("שם מלא וטלפון הם שדות חובה");
            return;
          }
          const fd = new FormData(e.currentTarget);
          // Persist sanitized phone
          fd.set("phone", sanitizePhone(phone));
          fd.set("fullName", fullName.trim());
          startTransition(async () => {
            const res = await createLead(fd);
            if (!res.ok) {
              setError(res.error);
              if ("fieldErrors" in res && res.fieldErrors) setFieldErrors(res.fieldErrors);
              if ("duplicate" in res && res.duplicate) setDuplicate(res.duplicate);
              return;
            }
            router.push(`/leads/${res.data.id}`);
          });
        }}
      >
        {error && (
          <div className="rounded-xl bg-[var(--urgent-soft)] px-3 py-2 text-sm text-[var(--urgent)]">
            {error}
            {duplicate && (
              <>
                {" "}
                <Link href={`/leads/${duplicate.id}`} className="font-bold underline">
                  מעבר לרשומה
                </Link>
              </>
            )}
          </div>
        )}

        {(liveDuplicates.length > 0 || duplicate) && (
          <div className="rounded-xl border border-[var(--warning)] bg-[#fff8e8] px-3 py-2 text-sm">
            {(liveDuplicates[0] ? [liveDuplicates[0]] : duplicate ? [duplicate] : []).map((d) => (
              <span key={d.id}>
                קיים כבר ליד פעיל בשם{" "}
                <Link href={`/leads/${d.id}`} className="font-bold text-[var(--brand)] underline">
                  {d.fullName}
                </Link>
              </span>
            ))}
          </div>
        )}

        <div className={cn("field", fieldErrors.fullName && "has-error")}>
          <label>שם מלא *</label>
          <input
            name="fullName"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (fieldErrors.fullName) setFieldErrors((f) => ({ ...f, fullName: undefined }));
            }}
            autoFocus
          />
          {fieldErrors.fullName && <span className="field-error-msg">{fieldErrors.fullName}</span>}
        </div>

        <div className={cn("field", fieldErrors.phone && "has-error")}>
          <label>טלפון *</label>
          <input
            name="phone"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined }));
            }}
            onBlur={() => {
              const cleaned = sanitizePhone(phone);
              if (cleaned) setPhone(cleaned);
            }}
            inputMode="tel"
            dir="ltr"
            className="text-right"
            placeholder="050-123-4567 או +972..."
          />
          {fieldErrors.phone && <span className="field-error-msg">{fieldErrors.phone}</span>}
          {phone && sanitizePhone(phone) && phone !== sanitizePhone(phone) && (
            <span className="text-[11px] text-[var(--muted)]">יישמר כ־{sanitizePhone(phone)}</span>
          )}
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
            <option value="urgent">🔴 דחוף</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "יוצר..." : "צור ליד"}
        </button>
      </form>
    </div>
  );
}
