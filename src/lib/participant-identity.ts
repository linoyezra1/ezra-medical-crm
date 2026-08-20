/**
 * ת״ז ייחודית בתוך הדרכה — נרמול והתאמה למניעת כפילויות
 * (Wix / טופס ציבורי / הוספה ידנית).
 */

/**
 * ניקוי ת״ז: מסיר רווחים, מקפים וכל תו שאינו ספרה.
 * משלים אפסים מובילים ל־9 ספרות כשחסרים (Google Sheets לעיתים מוריד אותם).
 * דוגמאות: "123-456-789" → "123456789" | "12345678" → "012345678"
 */
export function normalizeParticipantIdNumber(
  raw: string | null | undefined,
): string {
  const digits = (raw || "").trim().replace(/\D/g, "")
  if (digits.length >= 5 && digits.length < 9) {
    return digits.padStart(9, "0")
  }
  return digits
}

export function isUsableParticipantIdNumber(
  raw: string | null | undefined,
): boolean {
  const id = normalizeParticipantIdNumber(raw)
  // ת״ז ישראלית טיפוסית 5–12 ספרות; מונע התאמה על רעש חד־ספרתי
  return id.length >= 5 && id.length <= 12
}

/** חיפוש משתתף קיים בהדרכה לפי ת״ז מנורמלת */
export function findParticipantByIdNumber<
  T extends { idNumber: string },
>(participants: T[], idNumber: string | null | undefined): T | undefined {
  const id = normalizeParticipantIdNumber(idNumber)
  if (!isUsableParticipantIdNumber(id)) return undefined
  return participants.find((p) => {
    const pid = normalizeParticipantIdNumber(p.idNumber)
    return isUsableParticipantIdNumber(pid) && pid === id
  })
}

/** אינדקס ת״ז→משתתף לעדכון מהיר בזמן סנכרון */
export function indexParticipantsByIdNumber<
  T extends { idNumber: string },
>(participants: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const p of participants) {
    const id = normalizeParticipantIdNumber(p.idNumber)
    if (!isUsableParticipantIdNumber(id)) continue
    if (!map.has(id)) map.set(id, p)
  }
  return map
}

export function cleanParticipantPhone(
  raw: string | null | undefined,
): string {
  return (raw || "").replace(/[-\s().+]/g, "").trim()
}
