"use client";

type Props = {
  tiktokUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
};

export function SocialShareButtons({ tiktokUrl, facebookUrl, instagramUrl }: Props) {
  const links = [
    { label: "TikTok", url: tiktokUrl },
    { label: "Facebook", url: facebookUrl },
    { label: "Instagram", url: instagramUrl },
  ].filter((l): l is { label: string; url: string } => Boolean(l.url));

  if (links.length === 0) {
    return (
      <div className="card-surface p-3 text-sm text-[var(--muted)]">
        הוסיפו קישורי רשתות חברתיות ב־הגדרות כדי לשתף בלחיצה.
      </div>
    );
  }

  return (
    <section className="card-surface p-3">
      <h2 className="mb-2 text-sm font-extrabold">שיתוף פרופילים</h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => {
          const text = `עקבו אחרינו ב${l.label}: ${l.url}`;
          const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
          return (
            <a key={l.label} href={href} target="_blank" rel="noopener noreferrer" className="btn btn-secondary text-xs">
              שתף {l.label}
            </a>
          );
        })}
      </div>
    </section>
  );
}
