"use client"

import { UserRound } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCrmUser } from "@/lib/crm-user-context"
import type { CrmUserName } from "@/lib/crm-user"
import { cn } from "@/lib/utils"

export function UserSwitcher({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const { user, users, setUser } = useCrmUser()

  return (
    <div className={cn("space-y-1", className)}>
      {!compact && (
        <p className="text-[10px] font-medium text-muted-foreground">
          משתמש פעיל
        </p>
      )}
      <Select
        value={user}
        onValueChange={(v) => setUser((v ?? user) as CrmUserName)}
      >
        <SelectTrigger
          className={cn(
            "h-9 w-full rounded-xl border-border bg-background text-sm",
            compact && "h-8 text-xs",
          )}
          aria-label="בחירת משתמש"
        >
          <span className="flex items-center gap-2 truncate">
            <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {users.map((u) => (
            <SelectItem key={u} value={u}>
              {u}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
