/**
 * טוקן ייעודי לממשק מדריך — רק דרך URL ייחודי.
 * בפרודקשן הגדירו NEXT_PUBLIC_INSTRUCTOR_PORTAL_TOKEN (חובה לתאימות שרת+לקוח).
 */
export function getInstructorPortalToken(): string {
  return (
    process.env.NEXT_PUBLIC_INSTRUCTOR_PORTAL_TOKEN?.trim() ||
    process.env.INSTRUCTOR_PORTAL_TOKEN?.trim() ||
    "ezra-instructor-portal"
  )
}

export function isValidInstructorPortalToken(token: string | undefined | null): boolean {
  if (!token?.trim()) return false
  return token.trim() === getInstructorPortalToken()
}

export function instructorPortalPath(token: string, sub?: "pay"): string {
  const base = `/instructor/${encodeURIComponent(token)}`
  return sub === "pay" ? `${base}/pay` : base
}
