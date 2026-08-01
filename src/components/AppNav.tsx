"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/leads", label: "לידים", icon: Users },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link href="/leads" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand)] text-sm font-extrabold text-white">
              ע
            </span>
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight">עזרא ורפואה</div>
              <div className="text-[11px] text-[var(--muted)]">CRM נייד</div>
            </div>
          </Link>
          <Link href="/leads/new" className="btn btn-primary text-sm py-2 px-3">
            <Plus size={16} />
            ליד חדש
          </Link>
        </div>
      </header>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border)] bg-white/95 backdrop-blur safe-area">
        <div className="mx-auto grid max-w-5xl grid-cols-3">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
                  active ? "text-[var(--brand)]" : "text-[var(--muted)]"
                )}
              >
                <Icon size={20} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
