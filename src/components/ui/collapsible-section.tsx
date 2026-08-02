"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  alwaysOpen = false,
  children,
  action,
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  /** תמיד פתוח — בלי כפתור קיפול (למסכי טאב) */
  alwaysOpen?: boolean
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || alwaysOpen)
  const shown = alwaysOpen || open

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3">
        {alwaysOpen ? (
          <div className="min-w-0 flex-1 text-right">
            <h2 className="text-sm font-bold text-foreground">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 text-right"
          >
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                shown && "rotate-180",
              )}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground">{title}</h2>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </button>
        )}
        {action}
      </div>
      {shown && <div className="border-t border-border p-3 pt-3">{children}</div>}
    </section>
  )
}
