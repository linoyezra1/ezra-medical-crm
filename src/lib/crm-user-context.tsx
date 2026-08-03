"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  CRM_USER_COOKIE,
  CRM_USER_STORAGE_KEY,
  CRM_USERS,
  DEFAULT_CRM_USER,
  normalizeCrmUser,
  type CrmUserName,
} from "@/lib/crm-user"

type CrmUserContextValue = {
  user: CrmUserName
  users: readonly CrmUserName[]
  setUser: (user: CrmUserName) => void
}

const CrmUserContext = createContext<CrmUserContextValue | null>(null)

function readStoredUser(): CrmUserName {
  if (typeof window === "undefined") return DEFAULT_CRM_USER
  try {
    return normalizeCrmUser(window.localStorage.getItem(CRM_USER_STORAGE_KEY))
  } catch {
    return DEFAULT_CRM_USER
  }
}

function writeCookie(user: CrmUserName) {
  // 1 year — זמין גם ל־server actions / API
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${CRM_USER_COOKIE}=${encodeURIComponent(user)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function CrmUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CrmUserName>(DEFAULT_CRM_USER)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const next = readStoredUser()
    setUserState(next)
    writeCookie(next)
    setHydrated(true)
  }, [])

  const setUser = useCallback((next: CrmUserName) => {
    const normalized = normalizeCrmUser(next)
    setUserState(normalized)
    try {
      window.localStorage.setItem(CRM_USER_STORAGE_KEY, normalized)
    } catch {
      /* ignore */
    }
    writeCookie(normalized)
  }, [])

  const value = useMemo(
    () => ({
      user: hydrated ? user : DEFAULT_CRM_USER,
      users: CRM_USERS,
      setUser,
    }),
    [hydrated, user, setUser],
  )

  return (
    <CrmUserContext.Provider value={value}>{children}</CrmUserContext.Provider>
  )
}

export function useCrmUser() {
  const ctx = useContext(CrmUserContext)
  if (!ctx) throw new Error("useCrmUser must be used within CrmUserProvider")
  return ctx
}
