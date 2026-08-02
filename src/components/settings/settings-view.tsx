"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Eye, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { upsertCourseAsset } from "@/lib/actions";
import {
  buildStructuredSummary,
  buildSummaryVars,
} from "@/lib/summary-template";
import { useApp } from "@/lib/store";
import type { CourseCatalogItem, Lead } from "@/lib/types";

export function SettingsView() {
  const { settings, updateSettings } = useApp();
  const [openType, setOpenType] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CourseCatalogItem>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const courses = settings.courses;

  const getDraft = (c: CourseCatalogItem) => drafts[c.type] ?? c;

  const setDraftField = <K extends keyof CourseCatalogItem>(
    type: string,
    key: K,
    value: CourseCatalogItem[K]
  ) => {
    setDrafts((prev) => {
      const base = prev[type] ?? courses.find((x) => x.type === type)!;
      return { ...prev, [type]: { ...base, [key]: value } };
    });
  };

  const previewLead = useMemo(() => {
    return {
      id: "preview",
      clientId: "",
      name: "אתי",
      phone: "0501234567",
      urgent: false,
      status: "new" as const,
      customerType: "new" as const,
      courseType: "",
      category: "",
      pricingType: "global" as const,
      pricePerUnit: 0,
      extraParticipantPrice: 50,
      participantsCount: 12,
      totalPrice: 1700,
      certificateDelivery: "עזרה ורפואה" as const,
      address: { street: "רחוב הגן", houseNumber: "1", city: "תל אביב" },
      contactName: "אתי",
      participants: [],
      expenses: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Lead;
  }, []);

  const saveCourse = async (type: string) => {
    const draft = getDraft(courses.find((c) => c.type === type)!);
    setSaving(type);
    const res = await upsertCourseAsset({
      courseType: draft.type,
      title: draft.title,
      hours: draft.hours,
      audience: draft.audience,
      durationText: draft.durationText,
      natureText: draft.natureText,
      contents: draft.contents,
      pricingText: draft.pricingText,
      summaryTemplate: draft.summaryTemplate,
      bookletUrl: draft.bookletUrl,
      presentationUrl: draft.presentationUrl,
      syllabusUrl: draft.syllabusUrl,
    });
    setSaving(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    // עדכון מקומי ברשימת הקורסים
    updateSettings({
      courses: courses.map((c) => (c.type === type ? draft : c)),
    });
    toast.success("תכני הקורס נשמרו");
  };

  return (
    <div>
      <PageHeader title="הגדרות עסק" subtitle={settings.businessName} />

      <div className="space-y-4 p-4 pb-8">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">פרטי העסק</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>שם העסק</Label>
              <Input
                value={settings.businessName}
                onChange={(e) => updateSettings({ businessName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>אתר העסק</Label>
              <Input
                dir="ltr"
                value={settings.websiteUrl || ""}
                onChange={(e) => updateSettings({ websiteUrl: e.target.value })}
                placeholder="https://www.ezra-medical.com/כניסה-לתלמידים"
              />
              <p className="text-[11px] text-muted-foreground">
                ברירת מחדל: דף כניסה לתלמידים — משמש ל־QR לאתר בהוספת משתתפים
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">רשתות חברתיות</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>טיקטוק</Label>
              <Input
                dir="ltr"
                value={settings.tiktokUrl}
                onChange={(e) => updateSettings({ tiktokUrl: e.target.value })}
                placeholder="https://tiktok.com/@..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>פייסבוק</Label>
              <Input
                dir="ltr"
                value={settings.facebookUrl}
                onChange={(e) => updateSettings({ facebookUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>אינסטגרם</Label>
              <Input
                dir="ltr"
                value={settings.instagramUrl}
                onChange={(e) => updateSettings({ instagramUrl: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">ניהול תוכן וחוברות קורס</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              העלו או הדביקו קישור לחוברת לכל סוג קורס (22ש׳, 44ש׳ וכו׳). כפתור &quot;שלח חוברת&quot; בליד שולח את החוברת לפי סוג הקורס של הליד.
            </p>
          </div>

          {courses.map((c) => {
            const draft = getDraft(c);
            const open = openType === c.type;
            const previewLeadForCourse: Lead = {
              ...previewLead,
              courseType: draft.type,
            };
            const preview = buildStructuredSummary(
              previewLeadForCourse,
              draft,
              buildSummaryVars(previewLeadForCourse, draft),
            );

            return (
              <div key={c.type} className="rounded-2xl border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 p-4 text-right"
                  onClick={() => setOpenType(open ? null : c.type)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-primary" />
                      <p className="truncate text-sm font-bold">{draft.title || draft.type}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{draft.type}</p>
                  </div>
                  {open ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                </button>

                {open && (
                  <div className="space-y-3 border-t border-border p-4">
                    <div className="space-y-1.5">
                      <Label>שם קורס לתצוגה</Label>
                      <Input
                        value={draft.title}
                        onChange={(e) => setDraftField(c.type, "title", e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label>שעות (מספר)</Label>
                        <Input
                          type="number"
                          value={draft.hours}
                          onChange={(e) => setDraftField(c.type, "hours", Number(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>משך (טקסט)</Label>
                        <Input
                          value={draft.durationText || ""}
                          onChange={(e) => setDraftField(c.type, "durationText", e.target.value)}
                          placeholder="כ־4 שעות"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>למי הקורס מתאים</Label>
                      <Textarea
                        value={draft.audience || ""}
                        onChange={(e) => setDraftField(c.type, "audience", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>אופי הקורס</Label>
                      <Textarea
                        value={draft.natureText || ""}
                        onChange={(e) => setDraftField(c.type, "natureText", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>תכני הקורס</Label>
                      <Textarea
                        value={draft.contents || ""}
                        onChange={(e) => setDraftField(c.type, "contents", e.target.value)}
                        rows={5}
                        placeholder={"החייאה\nחנק\n..."}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>קישור חוברת</Label>
                      <Input
                        dir="ltr"
                        value={draft.bookletUrl || ""}
                        onChange={(e) => setDraftField(c.type, "bookletUrl", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>קישור מצגת</Label>
                      <Input
                        dir="ltr"
                        value={draft.presentationUrl || ""}
                        onChange={(e) => setDraftField(c.type, "presentationUrl", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>קישור סילבוס</Label>
                      <Input
                        dir="ltr"
                        value={draft.syllabusUrl || ""}
                        onChange={(e) => setDraftField(c.type, "syllabusUrl", e.target.value)}
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/40 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                        <Eye className="size-3.5" />
                        תצוגה מקדימה
                      </div>
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                        {preview}
                      </pre>
                    </div>

                    <Button
                      className="w-full rounded-xl"
                      disabled={saving === c.type}
                      onClick={() => void saveCourse(c.type)}
                    >
                      <Save className="size-4" />
                      {saving === c.type ? "שומר..." : "שמור תכני קורס"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
