import {
  EQUIPMENT_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  type EquipmentStatus,
  type LeadStatus,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const LEAD_STYLES: Record<LeadStatus, string> = {
  new: "bg-primary/10 text-primary",
  closed: "bg-chart-5/10 text-chart-5",
  done: "bg-warning/15 text-warning-foreground",
  pending_certificates: "bg-warning/15 text-warning-foreground",
  completed: "bg-success/15 text-success",
  lost: "bg-muted text-muted-foreground",
}

const EQUIPMENT_STYLES: Record<EquipmentStatus, string> = {
  inquiry: "bg-primary/10 text-primary",
  quote: "bg-chart-5/10 text-chart-5",
  order: "bg-warning/15 text-warning-foreground",
  invoice: "bg-warning/15 text-warning-foreground",
  paid: "bg-success/15 text-success",
}

export function LeadStatusBadge({
  status,
  className,
}: {
  status: LeadStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        LEAD_STYLES[status],
        className,
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}

export function EquipmentStatusBadge({
  status,
  className,
}: {
  status: EquipmentStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        EQUIPMENT_STYLES[status],
        className,
      )}
    >
      {EQUIPMENT_STATUS_LABELS[status]}
    </span>
  )
}

/** תג סטטוס מאוחד - בוחר בין ליד לעסקת ציוד */
export function StatusBadge({
  status,
  kind = "lead",
  className,
}: {
  status: LeadStatus | EquipmentStatus
  kind?: "lead" | "equipment"
  className?: string
}) {
  if (kind === "equipment") {
    return <EquipmentStatusBadge status={status as EquipmentStatus} className={className} />
  }
  return <LeadStatusBadge status={status as LeadStatus} className={className} />
}
