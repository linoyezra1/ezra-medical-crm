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
  MessageCircle,
  Receipt,
  Settings,
  UserRound,
  Users,
  Zap,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { UserSwitcher } from "@/components/user-switcher"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "דשבורד", icon: LayoutDashboard },
  { href: "/leads", label: "לידים", icon: Users },
  { href: "/trainings", label: "הדרכות", icon: GraduationCap },
  { href: "/clients", label: "מודרכים", icon: Contact },
]

const MORE = [
  { href: "/outreach-leads", label: "לידים לשיווק", icon: MessageCircle },
  { href: "/quick-actions", label: "פעולות מהירות", icon: Zap },
  { href: "/payment-history", label: "היסטוריית תשלומים", icon: Receipt },
  { href: "/equipment", label: "ניהול מלאי", icon: Boxes },
  { href: "/calendar", label: "יומן ומשימות", icon: CalendarDays },
  { href: "/instructors", label: "ניהול מדריכים", icon: UserRound },
  { href: "/settings", label: "הגדרות עסק", icon: Settings },
]

/** דסקטופ: פעולות מהירות בסרגל הראשי */
const DESKTOP_NAV = [
  ...NAV,
  { href: "/quick-actions", label: "פעולות מהירות", icon: Zap },
  ...MORE.filter((m) => m.href !== "/quick-actions"),
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { settings } = useApp()
  const [moreOpen, setMoreOpen] = useState(false)
  const isPublicForm = pathname.startsWith("/p/")
  const isPublicExam = pathname === "/exam" || pathname.startsWith("/exam/")
  const isInstructorLogin = pathname === "/instructor/login"
  const isInstructorDashboard = pathname.startsWith("/instructor/dashboard")
  const isInstructorGate =
    pathname === "/instructor" || pathname.startsWith("/instructor/")

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  if (isPublicForm || isPublicExam) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background md:max-w-lg md:py-6">
        <main className="flex-1 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-sm">
          {children}
        </main>
      </div>
    )
  }

  if (isInstructorLogin) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
        <main className="flex-1">{children}</main>
      </div>
    )
  }

  if (isInstructorDashboard) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background md:max-w-lg">
        <main className="flex-1">{children}</main>
      </div>
    )
  }

  if (isInstructorGate) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background md:max-w-lg md:justify-center md:py-10">
        <main className="flex-1 md:flex-none">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background md:flex md:overflow-x-hidden">
      {/* —— Desktop sidebar (RTL: start = ימין) —— */}
      <aside className="sticky top-0 z-40 hidden h-dvh w-64 flex-shrink-0 flex-col border-e border-border bg-card md:flex">
        <div className="border-b border-border px-4 py-4">
          <p className="text-xs font-medium text-muted-foreground">מערכת ניהול</p>
          <p className="text-base font-bold text-foreground">
            {settings.businessName}
          </p>
          <div className="mt-3">
            <UserSwitcher />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {DESKTOP_NAV.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* —— Main column —— */}
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden md:max-w-none md:min-w-0 md:flex-1 md:max-w-full">
        <main className="min-w-0 max-w-full flex-1 overflow-x-hidden pb-24 md:pb-0">
          {children}
        </main>
      </div>

      {/* —— Mobile bottom nav —— */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur-md md:hidden">
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
            <SheetContent side="bottom" className="rounded-t-3xl md:hidden">
              <SheetHeader className="text-right">
                <SheetTitle>תפריט נוסף</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 p-4 pt-0">
                <UserSwitcher />
                <div className="grid grid-cols-3 gap-3">
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
  className,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  back?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md md:px-6 md:py-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {back}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-foreground text-balance md:text-xl">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground md:text-sm">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
    </header>
  )
}
