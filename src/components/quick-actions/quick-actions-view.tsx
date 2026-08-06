"use client"

import { useState } from "react"
import {
  BookOpen,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Presentation,
  Printer,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { SendBookletDialog } from "@/components/leads/send-booklet-dialog"
import { BankAccountPickerDialog } from "@/components/quick-actions/bank-account-picker-dialog"
import { TrainingPickerDialog } from "@/components/quick-actions/training-picker-dialog"
import {
  courseMaterialUrl,
  type CourseMaterialKey,
} from "@/lib/course-materials"
import {
  findCourseCatalog,
  formatLeadCourseType,
} from "@/lib/course-type"
import {
  bankAccountWhatsAppMessage,
  type BankAccountKey,
} from "@/lib/bank-accounts"
import {
  instructorAssignmentWhatsAppMessage,
  whatsappLink,
  whatsappSummary,
} from "@/lib/helpers"
import { useApp } from "@/lib/store"
import type { Lead } from "@/lib/types"
import { cn } from "@/lib/utils"

type QuickActionId =
  | "share_instructor"
  | "send_booklet"
  | "booklet_print"
  | "exam_v1"
  | "exam_v2"
  | "participants_table"
  | "presentation"
  | "copy_summary"
  | "send_summary"
  | "send_bank_details"

type QuickActionDef = {
  id: QuickActionId
  label: string
  description: string
  icon: LucideIcon
}

const ACTIONS: QuickActionDef[] = [
  {
    id: "send_bank_details",
    label: "📲 שליחת פרטי חשבון",
    description: "לינוי / יצחק — פתיחת WhatsApp לבחירת איש קשר",
    icon: Smartphone,
  },
  {
    id: "share_instructor",
    label: "שליחה למדריך",
    description: "פרטי הדרכה וקישור רישום לוואטסאפ",
    icon: MessageCircle,
  },
  {
    id: "send_booklet",
    label: "שלח חוברת",
    description: "שליחת חוברת PDF במייל או וואטסאפ",
    icon: BookOpen,
  },
  {
    id: "booklet_print",
    label: "חוברת להדפסה",
    description: "קישור לחוברת Word להדפסה",
    icon: Printer,
  },
  {
    id: "exam_v1",
    label: "מבחן גרסה 1",
    description: "שליחת קישור למבחן 44 גרסה 1",
    icon: FileText,
  },
  {
    id: "exam_v2",
    label: "מבחן גרסה 2",
    description: "שליחת קישור למבחן 44 גרסה 2",
    icon: ClipboardList,
  },
  {
    id: "participants_table",
    label: "טבלת משתתפים",
    description: "שליחת פורמט טבלת משתתפים",
    icon: FileSpreadsheet,
  },
  {
    id: "presentation",
    label: "קישור מצגת",
    description: "שליחת קישור מצגת הקורס",
    icon: Presentation,
  },
  {
    id: "copy_summary",
    label: "העתק סיכום",
    description: "העתקת סיכום שיחה ללוח",
    icon: Copy,
  },
  {
    id: "send_summary",
    label: "סיכום שיחה",
    description: "שליחת סיכום שיחה בוואטסאפ",
    icon: Send,
  },
]

export function QuickActionsView() {
  const { leads, settings } = useApp()
  const [pendingAction, setPendingAction] = useState<QuickActionDef | null>(
    null,
  )
  const [bankAccountOpen, setBankAccountOpen] = useState(false)
  const [bookletLead, setBookletLead] = useState<Lead | null>(null)

  const startAction = (action: QuickActionDef) => {
    if (action.id === "send_bank_details") {
      setBankAccountOpen(true)
      return
    }
    setPendingAction(action)
  }

  const openBankWhatsApp = (bankKey: BankAccountKey) => {
    const text = bankAccountWhatsAppMessage(bankKey)
    // ללא מספר יעד — בחירת איש קשר ידנית ב‑WhatsApp
    window.open(whatsappLink("", text), "_blank", "noopener,noreferrer")
  }

  const runAction = async (action: QuickActionDef, lead: Lead) => {
    const course = findCourseCatalog(lead.courseType, settings.courses)
    const courseLabel = formatLeadCourseType(lead, settings.courses)
    const contact = lead.contactName?.trim() || lead.name

    const sendStatic = (key: CourseMaterialKey, label: string) => {
      const url = courseMaterialUrl(key)
      const text = `היי ${contact}, מצורף קישור להורדת ${label}:\n${url}`
      window.open(whatsappLink(lead.phone, text), "_blank", "noopener,noreferrer")
    }

    switch (action.id) {
      case "send_bank_details":
        // מטופל בנפרד — ללא בחירת הדרכה
        break
      case "share_instructor": {
        const registrationUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/p/${lead.id}`
            : `/p/${lead.id}`
        const text = instructorAssignmentWhatsAppMessage(lead, {
          courseLabel,
          registrationUrl,
        })
        window.open(whatsappLink("", text), "_blank", "noopener,noreferrer")
        break
      }
      case "send_booklet":
        setBookletLead(lead)
        break
      case "booklet_print":
        sendStatic("booklet44WordPrint", "חוברת להדפסה (Word)")
        break
      case "exam_v1":
        sendStatic("exam44v1", "מבחן 44 גרסה 1")
        break
      case "exam_v2":
        sendStatic("exam44v2", "מבחן 44 גרסה 2")
        break
      case "participants_table":
        sendStatic("participantsTable", "פורמט טבלת משתתפים")
        break
      case "presentation": {
        const url = course?.presentationUrl
        if (!url) {
          toast.error("לא הוגדר קישור מצגת לקורס זה")
          return
        }
        window.open(
          whatsappLink(lead.phone, `מצגת - ${courseLabel}\n${url}`),
          "_blank",
        )
        break
      }
      case "copy_summary": {
        try {
          await navigator.clipboard.writeText(whatsappSummary(lead, course))
          toast.success("סיכום השיחה הועתק")
        } catch {
          toast.error("לא ניתן להעתיק")
        }
        break
      }
      case "send_summary":
        window.open(
          whatsappLink(lead.phone, whatsappSummary(lead, course)),
          "_blank",
        )
        break
    }
  }

  return (
    <div>
      <PageHeader
        title="פעולות מהירות"
        subtitle="פעולות לפי הדרכה או פתיחה ישירה ל-WhatsApp"
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">
          רוב הפעולות יפתחו בחירת הדרכה. שליחת פרטי חשבון פותחת ישירות את
          WhatsApp לבחירת איש קשר.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => startAction(action)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-sm",
                  "active:scale-95 transition-transform hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                <Icon className="size-6 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {action.label}
                </span>
                <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                  {action.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <BankAccountPickerDialog
        open={bankAccountOpen}
        onOpenChange={setBankAccountOpen}
        onSelect={(account) => {
          openBankWhatsApp(account)
        }}
      />

      <TrainingPickerDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        leads={leads}
        actionLabel={pendingAction?.label}
        onSelect={(lead) => {
          const action = pendingAction
          setPendingAction(null)
          if (action) void runAction(action, lead)
        }}
      />

      {bookletLead ? (
        <SendBookletDialog
          lead={bookletLead}
          open={Boolean(bookletLead)}
          onOpenChange={(open) => {
            if (!open) setBookletLead(null)
          }}
        />
      ) : null}
    </div>
  )
}
