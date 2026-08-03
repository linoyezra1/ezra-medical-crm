/** משתמשי מערכת — שני אדמינים קבועים */
export const CRM_USERS = ["לינוי", "יצחק"] as const

export type CrmUserName = (typeof CRM_USERS)[number]

export const CRM_USER_COOKIE = "crm_user"
export const CRM_USER_STORAGE_KEY = "ezra-crm-user"
export const DEFAULT_CRM_USER: CrmUserName = "לינוי"

export function isCrmUserName(value: unknown): value is CrmUserName {
  return typeof value === "string" && (CRM_USERS as readonly string[]).includes(value)
}

export function normalizeCrmUser(value: unknown): CrmUserName {
  return isCrmUserName(value) ? value : DEFAULT_CRM_USER
}

/** תווית תצוגה קצרה */
export function crmUserLabel(user: CrmUserName): string {
  return user
}
