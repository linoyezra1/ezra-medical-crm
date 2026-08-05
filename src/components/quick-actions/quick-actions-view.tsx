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
  BANK_ACCOUNTS,
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
    description: "חשבון לינוי / יצחק בוואטסאפ לנמען",
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
  const [selectedBankAccount, setSelectedBankAccount] =
    useState<BankAccountKey | null>(null)
  const [bookletLead, setBookletLead] = useState<Lead | null>(null)

  const bankAction = ACTIONS.find((a) => a.id === "send_bank_details")!

  const startAction = (action: QuickActionDef) => {
    if (action.id === "send_bank_details") {
      setSelectedBankAccount(null)
      setBankAccountOpen(true)
      return
    }
    setPendingAction(action)
  }

  const runAction = async (
    action: QuickActionDef,
    lead: Lead,
    bankKey?: BankAccountKey | null,
  ) => {
    const course = findCourseCatalog(lead.courseType, settings.courses)
    const courseLabel = formatLeadCourseType(lead, settings.courses)
    const contact = lead.contactName?.trim() || lead.name

    const sendStatic = (key: CourseMaterialKey, label: string) => {
      const url = courseMaterialUrl(key)
      const text = `היי ${contact}, מצורף קישור להורדת ${label}:\n${url}`
      window.open(whatsappLink(lead.phone, text), "_blank", "noopener,noreferrer")
    }

    switch (action.id) {
      case "send_bank_details": {
        if (!bankKey) {
          toast.error("יש לבחור חשבון בנק")
          return
        }
        if (!lead.phone?.trim()) {
          toast.error("חסר טלפון להדרכה שנבחרה")
          return
        }
        const text = bankAccountWhatsAppMessage(bankKey)
        window.open(
          whatsappLink(lead.phone, text),
          "_blank",
          "noopener,noreferrer",
        )
        break
      }
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

  const trainingPickerOpen =
    Boolean(pendingAction) || Boolean(selectedBankAccount)
  const trainingPickerLabel = selectedBankAccount
    ? `${bankAction.label} · ${BANK_ACCOUNTS[selectedBankAccount].label}`
    : pendingAction?.label

  return (
    <div>
      <PageHeader
        title="פעולות מהירות"
        subtitle="בחרו פעולה ואז הדרכה לביצוע"
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">
          כל פעולה תפתח בחירת הדרכה, ואז תשתמש בפרטי אותה הדרכה (תאריך, כתובת,
          מדריך, מודרכים ומגע).
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
          setSelectedBankAccount(account)
        }}
      />

      <TrainingPickerDialog
        open={trainingPickerOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null)
            setSelectedBankAccount(null)
          }
        }}
        leads={leads}
        actionLabel={trainingPickerLabel}
        onSelect={(lead) => {
          if (selectedBankAccount) {
            const account = selectedBankAccount
            setSelectedBankAccount(null)
            void runAction(bankAction, lead, account)
            return
          }
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
