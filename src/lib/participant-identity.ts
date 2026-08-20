/**
 * ת״ז ייחודית בתוך הדרכה — נרמול והתאמה למניעת כפילויות
 * (Wix / טופס ציבורי / הוספה ידנית).
 */

export function normalizeParticipantIdNumber(
  raw: string | null | undefined,
): string {
  return (raw || "").trim().replace(/[-\s]/g, "")
}

export function isUsableParticipantIdNumber(
  raw: string | null | undefined,
): boolean {
  const id = normalizeParticipantIdNumber(raw)
  return Boolean(id) && !id.startsWith("temp-")
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

export function cleanParticipantPhone(
  raw: string | null | undefined,
): string {
  return (raw || "").replace(/[-\s().+]/g, "").trim()
}
