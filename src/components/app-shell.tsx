"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  Boxes,
  CalendarDays,
  Contact,
  GraduationCap,
  LayoutGrid,
  LayoutDashboard,
  Settings,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "דשבורד", icon: LayoutDashboard },
  { href: "/leads", label: "לידים", icon: Users },
  { href: "/trainings", label: "הדרכות", icon: GraduationCap },
  { href: "/clients", label: "מודרכים", icon: Contact },
]

const MORE = [
  { href: "/equipment", label: "ניהול מלאי", icon: Boxes },
  { href: "/calendar", label: "יומן ומשימות", icon: CalendarDays },
  { href: "/instructors", label: "הדרכות מדריכים", icon: UserRound },
  { href: "/instructor", label: "ממשק מדריך", icon: GraduationCap },
  { href: "/settings", label: "הגדרות עסק", icon: Settings },
]

const INSTRUCTOR_NAV = [
  { href: "/instructor", label: "הדרכות שלי", icon: GraduationCap, exact: true },
  { href: "/instructor/pay", label: "דשבורד שכר", icon: Wallet, exact: false },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const isPublicForm = pathname.startsWith("/p/")
  const isInstructorPortal =
    pathname === "/instructor" || pathname.startsWith("/instructor/")

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  if (isPublicForm) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
        <main className="flex-1">{children}</main>
      </div>
    )
  }

  if (isInstructorPortal) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
        <main className="flex-1 pb-24">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur-md">
          <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
            {INSTRUCTOR_NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-6" strokeWidth={1.8} />
                  {item.label}
                </Link>
              )
            })}
            <Link
              href="/"
              className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <LayoutDashboard className="size-6" strokeWidth={1.8} />
              חזרה למערכת
            </Link>
          </div>
        </nav>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur-md">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn("size-6", active && "fill-primary/10")}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {item.label}
              </Link>
            )
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                MORE.some((m) => isActive(m.href))
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="size-6" strokeWidth={1.8} />
              עוד
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl">
              <SheetHeader className="text-right">
                <SheetTitle>תפריט נוסף</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 p-4">
                {MORE.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/40 p-4 text-center text-xs font-medium text-foreground active:scale-95 transition-transform"
                    >
                      <Icon className="size-7 text-primary" strokeWidth={1.8} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  back?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {back}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-foreground text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  )
}
