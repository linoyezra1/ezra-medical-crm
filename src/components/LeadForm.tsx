"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_TYPES,
  COURSE_CATEGORIES,
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  COURSE_TYPES,
  DELIVERY_METHODS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS,
  EXPENSE_TYPES,
  LEAD_SOURCES,
  PAYMENT_STATUSES,
  PAYMENT_TERMS,
  SESSION_DURATIONS,
  type CourseStatus,
  type EquipmentStatus,
} from "@/lib/constants";
import {
  addExpense,
  addParticipant,
  checkDuplicatePhone,
  deleteExpense,
  removeParticipant,
  updateLead,
} from "@/lib/actions";
import { datetimeLocalValue, formatCurrency, cn, sanitizePhone } from "@/lib/utils";
import { ConflictModal, type ConflictItem } from "@/components/ConflictModal";
import Link from "next/link";

type LeadRecord = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string | null;
  leadSource: string | null;
  activityType: string;
  courseStatus: string;
  equipmentStatus: string | null;
  reason: string | null;
  courseType: string | null;
  courseTypeOther: string | null;
  courseCategory: string | null;
  courseCategoryOther: string | null;
  kindergartenApproved: boolean;
  expectedParticipants: number | null;
  sessionsCount: number | null;
  sessionDuration: string | null;
  sessionDurationOther: string | null;
  bookletRequired: boolean;
  scheduledStart: Date | string | null;
  scheduledEnd: Date | string | null;
  location: string | null;
  instructor: string | null;
  pricingModel: string;
  perParticipantRate: number | null;
  agreedPrice: number | null;
  quoteStatus: string;
  paymentTerms: string | null;
  paymentStatus: string;
  shippingStreet: string | null;
  shippingHouseNo: string | null;
  shippingCity: string | null;
  shippingZip: string | null;
  deliveryMethod: string | null;
  notes: string | null;
  participants: { id: string; fullName: string; idNumber: string }[];
  expenses: { id: string; type: string; amount: number; notes: string | null }[];
};

const TABS = [
  { id: "contact", label: "פרטי קשר" },
  { id: "course", label: "קורס / פעילות" },
  { id: "pricing", label: "תמחור ומשלוח" },
  { id: "people", label: "משתתפים" },
  { id: "expenses", label: "הוצאות" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function toFormState(lead: LeadRecord) {
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email ?? "",
    city: lead.city ?? "",
    leadSource: lead.leadSource ?? "",
    activityType: lead.activityType,
    courseStatus: lead.courseStatus,
    equipmentStatus: lead.equipmentStatus ?? "inquiry",
    reason: lead.reason ?? "",
    courseType: lead.courseType ?? "",
    courseTypeOther: lead.courseTypeOther ?? "",
    courseCategory: lead.courseCategory ?? "",
    courseCategoryOther: lead.courseCategoryOther ?? "",
    kindergartenApproved: lead.kindergartenApproved,
    expectedParticipants: lead.expectedParticipants?.toString() ?? "",
    sessionsCount: lead.sessionsCount?.toString() ?? "",
    sessionDuration: lead.sessionDuration ?? "",
    sessionDurationOther: lead.sessionDurationOther ?? "",
    bookletRequired: lead.bookletRequired,
    scheduledStart: datetimeLocalValue(lead.scheduledStart),
    scheduledEnd: datetimeLocalValue(lead.scheduledEnd),
    location: lead.location ?? "",
    instructor: lead.instructor ?? "",
    pricingModel: lead.pricingModel,
    perParticipantRate: lead.perParticipantRate?.toString() ?? "",
    agreedPrice: lead.agreedPrice?.toString() ?? "",
    quoteStatus: lead.quoteStatus,
    paymentTerms: lead.paymentTerms ?? "",
    paymentStatus: lead.paymentStatus,
    shippingStreet: lead.shippingStreet ?? "",
    shippingHouseNo: lead.shippingHouseNo ?? "",
    shippingCity: lead.shippingCity ?? "",
    shippingZip: lead.shippingZip ?? "",
    deliveryMethod: lead.deliveryMethod ?? "",
    notes: lead.notes ?? "",
  };
}

export function LeadForm({ lead }: { lead: LeadRecord }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("contact");
  const [form, setForm] = useState(() => toFormState(lead));
  const [duplicates, setDuplicates] = useState<{ id: string; fullName: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;

  const computedPrice = useMemo(() => {
    if (form.pricingModel !== "per_participant") return Number(form.agreedPrice) || 0;
    return (Number(form.perParticipantRate) || 0) * (Number(form.expectedParticipants) || 0);
  }, [form.pricingModel, form.perParticipantRate, form.expectedParticipants, form.agreedPrice]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    dirty.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function persist(bypassConflict = false) {
    setError(null);
    const current = formRef.current;
    const cleanedPhone = sanitizePhone(current.phone);
    const nextFieldErrors: { fullName?: string; phone?: string } = {};
    if (!current.fullName.trim()) nextFieldErrors.fullName = "שדה חובה";
    if (!cleanedPhone) nextFieldErrors.phone = "שדה חובה";
    if (nextFieldErrors.fullName || nextFieldErrors.phone) {
      setFieldErrors(nextFieldErrors);
      setError("שם מלא וטלפון הם שדות חובה");
      setTab("contact");
      return false;
    }
    setFieldErrors({});

    // Normalize phone in UI after successful sanitization path
    if (current.phone !== cleanedPhone) {
      setForm((prev) => ({ ...prev, phone: cleanedPhone }));
      formRef.current = { ...formRef.current, phone: cleanedPhone };
    }

    const payload = {
      ...formRef.current,
      phone: cleanedPhone,
      fullName: current.fullName.trim(),
      kindergartenApproved: formRef.current.kindergartenApproved,
      bookletRequired: formRef.current.bookletRequired,
      expectedParticipants: formRef.current.expectedParticipants
        ? Number(formRef.current.expectedParticipants)
        : null,
      sessionsCount: formRef.current.sessionsCount
        ? Number(formRef.current.sessionsCount)
        : null,
      perParticipantRate: formRef.current.perParticipantRate
        ? Number(formRef.current.perParticipantRate)
        : null,
      agreedPrice:
        formRef.current.pricingModel === "per_participant"
          ? (Number(formRef.current.perParticipantRate) || 0) *
            (Number(formRef.current.expectedParticipants) || 0)
          : formRef.current.agreedPrice
            ? Number(formRef.current.agreedPrice)
            : null,
    };

    const res = await updateLead(lead.id, payload, { bypassConflict });
    if (!res.ok) {
      if (res.code === "conflict" && res.conflicts) {
        setConflicts(res.conflicts);
        return false;
      }
      setError(res.error);
      return false;
    }
    dirty.current = false;
    setSavedAt(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setConflicts(null);
    router.refresh();
    return true;
  }

  // Auto-save every 5 seconds when dirty
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirty.current || pending) return;
      startTransition(() => {
        void persist(false);
      });
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Duplicate phone check
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!form.phone || form.phone.length < 9) {
        setDuplicates([]);
        return;
      }
      const res = await checkDuplicatePhone(form.phone, lead.id);
      setDuplicates(res.duplicates);
    }, 400);
    return () => clearTimeout(t);
  }, [form.phone, lead.id]);

  function switchTab(next: TabId) {
    if (dirty.current) {
      startTransition(() => {
        void persist(false).then(() => setTab(next));
      });
    } else {
      setTab(next);
    }
  }

  const [partName, setPartName] = useState("");
  const [partId, setPartId] = useState("");
  const [expenseType, setExpenseType] = useState("instructor_fee");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold border ${
              tab === t.id
                ? "bg-[var(--brand)] text-white border-[var(--brand)]"
                : "bg-white border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>{savedAt ? `נשמר אוטומטית ב־${savedAt}` : "שמירה אוטומטית כל 5 שניות"}</span>
        <button
          type="button"
          className="btn btn-primary text-xs py-1.5 px-3"
          disabled={pending}
          onClick={() => startTransition(() => void persist(false))}
        >
          שמור עכשיו
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--urgent)] bg-[var(--urgent-soft)] px-3 py-2 text-sm text-[var(--urgent)]">
          {error}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="rounded-xl border border-[var(--warning)] bg-[#fff8e8] px-3 py-2 text-sm">
          {duplicates.map((d) => (
            <span key={d.id}>
              קיים כבר ליד פעיל בשם{" "}
              <Link href={`/leads/${d.id}`} className="font-bold text-[var(--brand)] underline">
                {d.fullName}
              </Link>
            </span>
          ))}
        </div>
      )}

      {tab === "contact" && (
        <section className="card-surface grid gap-3 p-4 sm:grid-cols-2">
          <div className={cn("field sm:col-span-2", fieldErrors.fullName && "has-error")}>
            <label>שם מלא *</label>
            <input
              value={form.fullName}
              onChange={(e) => {
                setField("fullName", e.target.value);
                if (fieldErrors.fullName) setFieldErrors((f) => ({ ...f, fullName: undefined }));
              }}
            />
            {fieldErrors.fullName && <span className="field-error-msg">{fieldErrors.fullName}</span>}
          </div>
          <div className={cn("field", fieldErrors.phone && "has-error")}>
            <label>טלפון *</label>
            <input
              value={form.phone}
              onChange={(e) => {
                setField("phone", e.target.value);
                if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined }));
              }}
              onBlur={() => {
                const cleaned = sanitizePhone(form.phone);
                if (cleaned && cleaned !== form.phone) setField("phone", cleaned);
              }}
              inputMode="tel"
              dir="ltr"
              className="text-right"
              placeholder="050-123-4567 או +972..."
            />
            {fieldErrors.phone && <span className="field-error-msg">{fieldErrors.phone}</span>}
            {form.phone && sanitizePhone(form.phone) && form.phone !== sanitizePhone(form.phone) && (
              <span className="text-[11px] text-[var(--muted)]">יישמר כ־{sanitizePhone(form.phone)}</span>
            )}
          </div>
          <div className="field">
            <label>אימייל</label>
            <input
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              type="email"
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="field">
            <label>עיר / יישוב</label>
            <input value={form.city} onChange={(e) => setField("city", e.target.value)} />
          </div>
          <div className="field">
            <label>מקור ליד</label>
            <select value={form.leadSource} onChange={(e) => setField("leadSource", e.target.value)}>
              <option value="">—</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field sm:col-span-2">
            <label>סטטוס קורס</label>
            <select value={form.courseStatus} onChange={(e) => setField("courseStatus", e.target.value)}>
              {COURSE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COURSE_STATUS_LABELS[s as CourseStatus]}
                </option>
              ))}
            </select>
          </div>
          <div className="field sm:col-span-2">
            <label>הערות</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </section>
      )}

      {tab === "course" && (
        <section className="card-surface grid gap-3 p-4 sm:grid-cols-2">
          <div className="field">
            <label>סוג פעילות</label>
            <select value={form.activityType} onChange={(e) => setField("activityType", e.target.value)}>
              {ACTIVITY_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          {(form.activityType === "equipment" || form.activityType === "combined") && (
            <div className="field">
              <label>סטטוס ציוד</label>
              <select
                value={form.equipmentStatus}
                onChange={(e) => setField("equipmentStatus", e.target.value)}
              >
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EQUIPMENT_STATUS_LABELS[s as EquipmentStatus]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field sm:col-span-2">
            <label>סיבת הדרכה</label>
            <input value={form.reason} onChange={(e) => setField("reason", e.target.value)} />
          </div>
          <div className="field">
            <label>סוג קורס</label>
            <select value={form.courseType} onChange={(e) => setField("courseType", e.target.value)}>
              <option value="">—</option>
              {COURSE_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {form.courseType === "other" && (
            <div className="field">
              <label>סוג קורס (חופשי)</label>
              <input value={form.courseTypeOther} onChange={(e) => setField("courseTypeOther", e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>קטגוריה</label>
            <select value={form.courseCategory} onChange={(e) => setField("courseCategory", e.target.value)}>
              <option value="">—</option>
              {COURSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {form.courseCategory === "other" && (
            <div className="field">
              <label>קטגוריה (חופשי)</label>
              <input
                value={form.courseCategoryOther}
                onChange={(e) => setField("courseCategoryOther", e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label>כמות משתתפים</label>
            <input
              type="number"
              min={0}
              value={form.expectedParticipants}
              onChange={(e) => setField("expectedParticipants", e.target.value)}
            />
          </div>
          {form.pricingModel === "per_participant" && (
            <div className="sm:col-span-2 rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-sm">
              <div className="font-bold">מחיר כולל (עדכון בזמן אמת)</div>
              <div className="mt-1 text-[var(--muted)]">
                {Number(form.perParticipantRate) || 0} ₪ × {Number(form.expectedParticipants) || 0} משתתפים ={" "}
                <span className="font-extrabold text-[var(--fg)]">{formatCurrency(computedPrice)}</span>
              </div>
            </div>
          )}
          <div className="field">
            <label>מספר מפגשים</label>
            <input
              type="number"
              min={0}
              value={form.sessionsCount}
              onChange={(e) => setField("sessionsCount", e.target.value)}
            />
          </div>
          <div className="field">
            <label>משך מפגש</label>
            <select value={form.sessionDuration} onChange={(e) => setField("sessionDuration", e.target.value)}>
              <option value="">—</option>
              {SESSION_DURATIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>מדריך</label>
            <input value={form.instructor} onChange={(e) => setField("instructor", e.target.value)} />
          </div>
          <div className="field">
            <label>תחילת קורס</label>
            <input
              type="datetime-local"
              value={form.scheduledStart}
              onChange={(e) => setField("scheduledStart", e.target.value)}
            />
          </div>
          <div className="field">
            <label>סיום קורס</label>
            <input
              type="datetime-local"
              value={form.scheduledEnd}
              onChange={(e) => setField("scheduledEnd", e.target.value)}
            />
          </div>
          <div className="field sm:col-span-2">
            <label>מיקום / כתובת</label>
            <input value={form.location} onChange={(e) => setField("location", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.kindergartenApproved}
              onChange={(e) => setField("kindergartenApproved", e.target.checked)}
            />
            נדרש אישור גן / משרד החינוך
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.bookletRequired}
              onChange={(e) => setField("bookletRequired", e.target.checked)}
            />
            נדרשת חוברת
          </label>
        </section>
      )}

      {tab === "pricing" && (
        <section className="card-surface grid gap-3 p-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label>מודל תמחור</label>
            <select value={form.pricingModel} onChange={(e) => setField("pricingModel", e.target.value)}>
              <option value="flat_rate">מחיר גלובלי</option>
              <option value="per_participant">פר משתתף</option>
            </select>
          </div>

          {form.pricingModel === "per_participant" ? (
            <>
              <div className="field">
                <label>מחיר ליחיד / למשתתף (₪)</label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={form.perParticipantRate}
                  onChange={(e) => setField("perParticipantRate", e.target.value)}
                />
              </div>
              <div className="field">
                <label>כמות משתתפים</label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={form.expectedParticipants}
                  onChange={(e) => setField("expectedParticipants", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 rounded-xl bg-[var(--brand-soft)] px-3 py-3 text-sm">
                <div className="text-xs font-semibold text-[var(--muted)]">חישוב אוטומטי</div>
                <div className="mt-1 font-bold text-base">
                  {Number(form.perParticipantRate) || 0} × {Number(form.expectedParticipants) || 0} ={" "}
                  {formatCurrency(computedPrice)}
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  מחיר כולל = מחיר למשתתף × כמות (מתעדכן בזמן אמת)
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field sm:col-span-2">
                <label>מחיר גלובלי מוסכם (₪) – הזנה ידנית</label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={form.agreedPrice}
                  onChange={(e) => setField("agreedPrice", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--muted)]">
                מחיר גלובלי – ללא חישוב אוטומטי. הסכום נקבע ידנית בלבד.
              </div>
            </>
          )}

          <div className="field">
            <label>סטטוס הצעה</label>
            <select value={form.quoteStatus} onChange={(e) => setField("quoteStatus", e.target.value)}>
              <option value="not_sent">לא נשלחה</option>
              <option value="sent">נשלחה</option>
            </select>
          </div>
          <div className="field">
            <label>תנאי תשלום</label>
            <select value={form.paymentTerms} onChange={(e) => setField("paymentTerms", e.target.value)}>
              <option value="">—</option>
              {PAYMENT_TERMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>סטטוס תשלום</label>
            <select value={form.paymentStatus} onChange={(e) => setField("paymentStatus", e.target.value)}>
              {PAYMENT_STATUSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>שיטת מסירת תעודות</label>
            <select value={form.deliveryMethod} onChange={(e) => setField("deliveryMethod", e.target.value)}>
              <option value="">—</option>
              {DELIVERY_METHODS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>רחוב</label>
            <input value={form.shippingStreet} onChange={(e) => setField("shippingStreet", e.target.value)} />
          </div>
          <div className="field">
            <label>מספר בית</label>
            <input value={form.shippingHouseNo} onChange={(e) => setField("shippingHouseNo", e.target.value)} />
          </div>
          <div className="field">
            <label>עיר למשלוח</label>
            <input value={form.shippingCity} onChange={(e) => setField("shippingCity", e.target.value)} />
          </div>
          <div className="field">
            <label>מיקוד (אופציונלי)</label>
            <input value={form.shippingZip} onChange={(e) => setField("shippingZip", e.target.value)} />
          </div>
        </section>
      )}
      {tab === "people" && (
        <section className="card-surface space-y-3 p-4">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await addParticipant(lead.id, partName, partId);
                if (!res.ok) setError(res.error);
                else {
                  setPartName("");
                  setPartId("");
                  router.refresh();
                }
              });
            }}
          >
            <div className="field">
              <label>שם מלא</label>
              <input value={partName} onChange={(e) => setPartName(e.target.value)} required />
            </div>
            <div className="field">
              <label>ת.ז.</label>
              <input value={partId} onChange={(e) => setPartId(e.target.value)} required dir="ltr" />
            </div>
            <button type="submit" className="btn btn-primary self-end" disabled={pending}>
              הוסף
            </button>
          </form>
          <ul className="divide-y divide-[var(--border)]">
            {lead.participants.length === 0 && (
              <li className="py-3 text-sm text-[var(--muted)]">אין משתתפים עדיין</li>
            )}
            {lead.participants.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-semibold">{p.fullName}</div>
                  <div className="text-[var(--muted)] dir-ltr text-right">{p.idNumber}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger text-xs py-1 px-2"
                  onClick={() =>
                    startTransition(async () => {
                      await removeParticipant(p.id, lead.id);
                      router.refresh();
                    })
                  }
                >
                  מחק
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "expenses" && (
        <section className="card-surface space-y-3 p-4">
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await addExpense(lead.id, {
                  type: expenseType,
                  amount: Number(expenseAmount),
                  notes: expenseNotes,
                });
                if (!res.ok) setError(res.error);
                else {
                  setExpenseAmount("");
                  setExpenseNotes("");
                  router.refresh();
                }
              });
            }}
          >
            <div className="field">
              <label>סוג הוצאה</label>
              <select value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>סכום (₪)</label>
              <input
                type="number"
                min={1}
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                required
              />
            </div>
            <div className="field sm:col-span-2">
              <label>הערות / קבלה</label>
              <input value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary sm:col-span-2" disabled={pending}>
              ➕ הוסף הוצאה
            </button>
          </form>
          <ul className="divide-y divide-[var(--border)]">
            {lead.expenses.length === 0 && (
              <li className="py-3 text-sm text-[var(--muted)]">אין הוצאות</li>
            )}
            {lead.expenses.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-semibold">
                    {EXPENSE_TYPES.find((t) => t.value === ex.type)?.label ?? ex.type}
                  </div>
                  <div className="text-[var(--muted)]">{ex.notes || "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{formatCurrency(ex.amount)}</span>
                  <button
                    type="button"
                    className="btn btn-danger text-xs py-1 px-2"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteExpense(ex.id, lead.id);
                        router.refresh();
                      })
                    }
                  >
                    מחק
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-sm font-bold">
            סה״כ הוצאות:{" "}
            {formatCurrency(lead.expenses.reduce((sum, e) => sum + e.amount, 0))}
          </div>
        </section>
      )}

      {conflicts && (
        <ConflictModal
          conflicts={conflicts}
          current={{
            courseType: form.courseType,
            city: form.city,
            scheduledStart: form.scheduledStart,
            scheduledEnd: form.scheduledEnd,
            instructor: form.instructor,
          }}
          onCancel={() => setConflicts(null)}
          onConfirm={() => {
            startTransition(() => {
              void persist(true);
            });
          }}
        />
      )}
    </div>
  );
}
