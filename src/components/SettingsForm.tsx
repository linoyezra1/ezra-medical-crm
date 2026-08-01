"use client";

import { useEffect, useState, useTransition } from "react";
import { updateSettings } from "@/lib/actions";

type SettingsData = {
  businessName: string;
  tiktokUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  lmsApiUrl: string | null;
  lmsLoginUrl: string | null;
  calendarEnabled: boolean;
};

export function SettingsForm({ initial }: { initial: SettingsData }) {
  const [form, setForm] = useState({
    businessName: initial.businessName,
    tiktokUrl: initial.tiktokUrl ?? "",
    facebookUrl: initial.facebookUrl ?? "",
    instagramUrl: initial.instagramUrl ?? "",
    lmsApiUrl: initial.lmsApiUrl ?? "",
    lmsLoginUrl: initial.lmsLoginUrl ?? "",
    calendarEnabled: initial.calendarEnabled,
  });
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <form
      className="card-surface grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await updateSettings({
            businessName: form.businessName,
            tiktokUrl: form.tiktokUrl || undefined,
            facebookUrl: form.facebookUrl || undefined,
            instagramUrl: form.instagramUrl || undefined,
            lmsApiUrl: form.lmsApiUrl || undefined,
            lmsLoginUrl: form.lmsLoginUrl || undefined,
            calendarEnabled: form.calendarEnabled,
          });
          setSaved(true);
        });
      }}
    >
      <div className="field">
        <label>שם העסק</label>
        <input
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
        />
      </div>
      <div className="field">
        <label>TikTok</label>
        <input
          value={form.tiktokUrl}
          onChange={(e) => setForm({ ...form, tiktokUrl: e.target.value })}
          dir="ltr"
          className="text-right"
          placeholder="https://..."
        />
      </div>
      <div className="field">
        <label>Facebook</label>
        <input
          value={form.facebookUrl}
          onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
          dir="ltr"
          className="text-right"
          placeholder="https://..."
        />
      </div>
      <div className="field">
        <label>Instagram</label>
        <input
          value={form.instagramUrl}
          onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
          dir="ltr"
          className="text-right"
          placeholder="https://..."
        />
      </div>
      <div className="field">
        <label>כתובת API ל־LMS</label>
        <input
          value={form.lmsApiUrl}
          onChange={(e) => setForm({ ...form, lmsApiUrl: e.target.value })}
          dir="ltr"
          className="text-right"
        />
      </div>
      <div className="field">
        <label>קישור התחברות LMS</label>
        <input
          value={form.lmsLoginUrl}
          onChange={(e) => setForm({ ...form, lmsLoginUrl: e.target.value })}
          dir="ltr"
          className="text-right"
        />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={form.calendarEnabled}
          onChange={(e) => setForm({ ...form, calendarEnabled: e.target.checked })}
        />
        סנכרון Google Calendar פעיל (דורש מפתחות API)
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "שומר..." : "שמור הגדרות"}
      </button>
      {saved && <p className="text-sm text-[var(--success)]">נשמר בהצלחה</p>}
    </form>
  );
}
