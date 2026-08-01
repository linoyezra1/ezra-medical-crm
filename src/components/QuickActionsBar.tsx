"use client";

import { useState, useTransition } from "react";
import {
  Phone,
  MessageCircle,
  BookOpen,
  Link2,
  FileSpreadsheet,
  StickyNote,
  UserPlus,
} from "lucide-react";
import { createLmsUser } from "@/lib/actions";
import { buildWhatsAppUrl, summaryMessage } from "@/lib/whatsapp";
import { sanitizePhone } from "@/lib/utils";

type Asset = {
  bookletUrl?: string | null;
  presentationUrl?: string | null;
  presentationFile?: string | null;
  summaryText?: string | null;
} | null;

type Props = {
  lead: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    courseType: string | null;
    courseTypeOther: string | null;
    scheduledStart: Date | string | null;
    location: string | null;
    city: string | null;
  };
  asset: Asset;
};

export function QuickActionsBar({ lead, asset }: Props) {
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const dialHref = `tel:${sanitizePhone(lead.phone)}`;

  function openWhatsApp(text: string) {
    window.open(buildWhatsAppUrl(lead.phone, text), "_blank");
  }

  function sendBooklet() {
    const url = asset?.bookletUrl;
    if (!url) {
      setToast("לא הוגדר חוברת לקורס זה בהגדרות נכסים");
      return;
    }
    openWhatsApp(`שלום ${lead.fullName}, מצורפת חוברת הקורס: ${url}`);
  }

  function sendPresentationLink() {
    const url = asset?.presentationUrl;
    if (!url) {
      setToast("לא הוגדר קישור מצגת לקורס זה");
      return;
    }
    openWhatsApp(`שלום ${lead.fullName}, קישור למצגת הקורס: ${url}`);
  }

  function sendPresentationFile() {
    const url = asset?.presentationFile || asset?.presentationUrl;
    if (!url) {
      setToast("לא הוגדר קובץ מצגת לקורס זה");
      return;
    }
    openWhatsApp(`שלום ${lead.fullName}, קובץ המצגת: ${url}`);
  }

  function sendCourseSummary() {
    const text =
      asset?.summaryText ||
      summaryMessage(lead);
    openWhatsApp(text);
  }

  function handleLms() {
    startTransition(async () => {
      const res = await createLmsUser(lead.id);
      if (!res.ok) {
        setToast(res.error);
        return;
      }
      openWhatsApp(res.data.message);
      setToast("פרטי LMS נוצרו ונפתח WhatsApp");
    });
  }

  const actions = [
    {
      label: "חייג",
      icon: Phone,
      onClick: () => {
        window.location.href = dialHref;
      },
    },
    {
      label: "סיכום WhatsApp",
      icon: MessageCircle,
      onClick: () => openWhatsApp(summaryMessage(lead)),
    },
    { label: "חוברת קורס", icon: BookOpen, onClick: sendBooklet },
    { label: "קישור מצגת", icon: Link2, onClick: sendPresentationLink },
    { label: "קובץ מצגת", icon: FileSpreadsheet, onClick: sendPresentationFile },
    { label: "סיכום קורס", icon: StickyNote, onClick: sendCourseSummary },
    { label: "משתמש LMS", icon: UserPlus, onClick: handleLms, disabled: pending },
  ];

  return (
    <section className="card-surface p-3">
      <h2 className="mb-2 text-sm font-extrabold">פעולות מהירות</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="btn btn-secondary text-xs py-2.5"
            onClick={a.onClick}
            disabled={a.disabled}
          >
            <a.icon size={15} />
            {a.label}
          </button>
        ))}
      </div>
      {toast && (
        <p className="mt-2 text-xs text-[var(--warning)]" role="status">
          {toast}
        </p>
      )}
    </section>
  );
}
