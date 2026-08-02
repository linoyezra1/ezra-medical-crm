import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { jerusalemDatetimeLocalValue } from "@/lib/timezone";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize Israeli phone to digits only (05XXXXXXXX). */
export function sanitizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("9720")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("972")) {
    digits = "0" + digits.slice(3);
  }
  if (digits.startsWith("00972")) {
    digits = "0" + digits.slice(5);
  }
  return digits;
}

export function isValidIsraeliMobile(phone: string): boolean {
  const p = sanitizePhone(phone);
  return /^0\d{8,9}$/.test(p);
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  return sanitizePhone(phone);
}

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

export function datetimeLocalValue(date: Date | string | null | undefined): string {
  return jerusalemDatetimeLocalValue(date);
}

export function labelOf(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? value;
}
