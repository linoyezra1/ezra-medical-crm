import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings =
    (await prisma.settings.findUnique({ where: { id: "default" } })) ??
    (await prisma.settings.create({
      data: { id: "default", businessName: "עזרא ורפואה" },
    }));

  const assets = await prisma.courseAsset.findMany({ orderBy: { courseType: "asc" } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">הגדרות</h1>
        <p className="text-sm text-[var(--muted)]">קישורי רשתות, LMS ונכסי קורס</p>
      </div>
      <SettingsForm initial={settings} />

      <section className="card-surface p-4">
        <h2 className="font-extrabold mb-2">נכסי קורס (חוברות / מצגות)</h2>
        {assets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            אין נכסים עדיין. לאחר הרצת seed יופיעו קישורי דוגמה לפי סוג קורס.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {assets.map((a) => (
              <li key={a.id} className="rounded-xl border border-[var(--border)] p-3">
                <div className="font-bold">{a.courseType}</div>
                <div className="text-[var(--muted)] text-xs mt-1 break-all">
                  חוברת: {a.bookletUrl || "—"}
                  <br />
                  מצגת: {a.presentationUrl || "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
