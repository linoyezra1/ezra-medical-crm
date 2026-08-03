import { cookies } from "next/headers"
import {
  CRM_USER_COOKIE,
  DEFAULT_CRM_USER,
  normalizeCrmUser,
  type CrmUserName,
} from "@/lib/crm-user"

/** קריאת המשתמש הפעיל מ־cookie (server actions / route handlers) */
export async function getActiveCrmUser(): Promise<CrmUserName> {
  try {
    const store = await cookies()
    const raw = store.get(CRM_USER_COOKIE)?.value
    if (!raw) return DEFAULT_CRM_USER
    return normalizeCrmUser(decodeURIComponent(raw))
  } catch {
    return DEFAULT_CRM_USER
  }
}
