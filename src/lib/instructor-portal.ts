import { instructorDashboardPath } from "@/lib/instructor-portal-urls"

/**
 * טוקן ייעודי לממשק מדריך — legacy; כניסה חדשה דרך /instructor/login
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

export function instructorPortalPath(_token?: string, _sub?: "pay"): string {
  return instructorDashboardPath()
}

export {
  buildInstructorCredentialsWhatsApp,
  instructorLoginUrl,
} from "@/lib/instructor-portal-urls"
