"use client"

import { Copy, Mail, MessageCircle, Phone } from "lucide-react"
import { toast } from "sonner"
import { ExamScoreBadge } from "@/components/exam/exam-score-badge"
import { Textarea } from "@/components/ui/textarea"
import { formatPhone, whatsappLink } from "@/lib/helpers"
import { cn } from "@/lib/utils"

/** פאנל פרטים משניים לשורת טבלה מתרחבת (דסקטופ) */
export function TraineeContactDetailsPanel({
  fullName,
  idNumber,
  phone,
  email,
  examScore,
  examPassed,
  examCompletedAt,
  examDraftAnswers,
  notes,
  notesEditable,
  onNotesChange,
  onNotesBlur,
  extra,
  className,
}: {
  fullName?: string
  idNumber?: string
  phone?: string
  email?: string
  examScore?: number
  examPassed?: boolean
  examCompletedAt?: string
  examDraftAnswers?: Record<string, string>
  notes?: string
  notesEditable?: boolean
  onNotesChange?: (value: string) => void
  onNotesBlur?: (value: string) => void
  extra?: React.ReactNode
  className?: string
}) {
  const copyId = async () => {
    const raw = (idNumber || "").trim()
    if (!raw) {
      toast.error("אין ת״ז להעתקה")
      return
    }
    try {
      await navigator.clipboard.writeText(raw)
      toast.success("ת״ז הועתקה")
    } catch {
      toast.error("לא ניתן להעתיק")
    }
  }

  const phoneDigits = (phone || "").replace(/\D/g, "")

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
          שם מלא
        </p>
        <p className="font-medium text-foreground">
          {(fullName || "").trim() || "—"}
        </p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
          תעודת זהות
        </p>
        <div className="flex items-center gap-1.5" dir="ltr">
          <span className="font-medium tabular-nums text-foreground">
            {idNumber || "—"}
          </span>
          {idNumber ? (
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={() => void copyId()}
              aria-label="העתק ת״ז"
              title="העתק"
            >
              <Copy className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
          טלפון
        </p>
        {phone ? (
          <div className="flex items-center gap-1.5">
            <a
              href={`tel:${phone}`}
              className="font-medium text-primary hover:underline"
              dir="ltr"
            >
              {formatPhone(phone)}
            </a>
            {phoneDigits ? (
              <a
                href={whatsappLink(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50"
                aria-label="וואטסאפ"
                title="וואטסאפ"
              >
                <MessageCircle className="size-3.5" />
              </a>
            ) : null}
            <a
              href={`tel:${phone}`}
              className="rounded-md p-1 text-primary hover:bg-primary/10"
              aria-label="חיוג"
              title="חיוג"
            >
              <Phone className="size-3.5" />
            </a>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
          אימייל
        </p>
        {email ? (
          <a
            href={`mailto:${email}`}
            className="inline-flex max-w-full items-center gap-1 truncate font-medium text-primary hover:underline"
            dir="ltr"
          >
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{email}</span>
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
          ציון מבחן דיגיטלי
        </p>
        {examCompletedAt && examScore != null ? (
          <ExamScoreBadge
            examScore={examScore}
            examPassed={examPassed}
            examCompletedAt={examCompletedAt}
            examDraftAnswers={examDraftAnswers}
            className="inline-flex px-2 py-1 text-xs"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div className="sm:col-span-2 lg:col-span-4">
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
          הערות מפורטות
        </p>
        {notesEditable ? (
          <Textarea
            value={notes || ""}
            onChange={(e) => onNotesChange?.(e.target.value)}
            onBlur={(e) => onNotesBlur?.(e.target.value)}
            placeholder="הערות…"
            rows={2}
            className="text-sm"
          />
        ) : (
          <p className="whitespace-pre-wrap rounded-lg bg-background/60 px-2.5 py-2 text-foreground">
            {(notes || "").trim() || "—"}
          </p>
        )}
      </div>

      {extra ? (
        <div className="sm:col-span-2 lg:col-span-4">{extra}</div>
      ) : null}
    </div>
  )
}
