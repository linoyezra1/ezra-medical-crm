/** Normalize Israeli phone to digits only, keep leading 0 or convert +972 */
export function sanitizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) {
    digits = "0" + digits.slice(3);
  }
  return digits;
}

/** WhatsApp wa.me expects country code without + */
export function toWhatsAppNumber(phone: string): string {
  const sanitized = sanitizePhone(phone);
  if (sanitized.startsWith("0")) {
    return "972" + sanitized.slice(1);
  }
  return sanitized;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function datetimeLocalValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? value;
}
