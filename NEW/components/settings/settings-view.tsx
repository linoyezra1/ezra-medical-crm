"use client"

import { BookOpen, FileText, Presentation } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApp } from "@/lib/store"

export function SettingsView() {
  const { settings, updateSettings } = useApp()

  return (
    <div>
      <PageHeader title="הגדרות עסק" subtitle={settings.businessName} />

      <div className="space-y-4 p-4">
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
                placeholder="https://facebook.com/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>אינסטגרם</Label>
              <Input
                dir="ltr"
                value={settings.instagramUrl}
                onChange={(e) => updateSettings({ instagramUrl: e.target.value })}
                placeholder="https://instagram.com/..."
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">קטלוג קורסים</h2>
          <div className="space-y-2">
            {settings.courses.map((c) => (
              <div key={c.type} className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{c.type}</p>
                  <span className="text-xs text-muted-foreground">{c.hours} שעות</span>
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <a href={c.syllabusUrl} className="flex items-center gap-1 rounded-lg bg-card px-2 py-1 text-primary">
                    <FileText className="size-3.5" /> סילבוס
                  </a>
                  <a href={c.presentationUrl} className="flex items-center gap-1 rounded-lg bg-card px-2 py-1 text-primary">
                    <Presentation className="size-3.5" /> מצגת
                  </a>
                  <a href={c.bookletUrl} className="flex items-center gap-1 rounded-lg bg-card px-2 py-1 text-primary">
                    <BookOpen className="size-3.5" /> חוברת
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
