import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { INSTRUCTOR_SESSION_COOKIE } from "@/lib/instructor-auth-server"

const PUBLIC_PATHS = new Set(["/instructor/login"])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/instructor") {
    const hasSession = Boolean(
      request.cookies.get(INSTRUCTOR_SESSION_COOKIE)?.value,
    )
    return NextResponse.redirect(
      new URL(
        hasSession ? "/instructor/dashboard" : "/instructor/login",
        request.url,
      ),
    )
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  if (pathname === "/instructor/dashboard") {
    const hasSession = Boolean(
      request.cookies.get(INSTRUCTOR_SESSION_COOKIE)?.value,
    )
    if (!hasSession) {
      const login = new URL("/instructor/login", request.url)
      login.searchParams.set("next", pathname)
      return NextResponse.redirect(login)
    }
    return NextResponse.next()
  }

  // Legacy token URLs → login
  if (/^\/instructor\/(?!login|dashboard)[^/]+(?:\/pay)?\/?$/.test(pathname)) {
    return NextResponse.redirect(new URL("/instructor/login", request.url))
  }

  if (pathname.startsWith("/instructor/")) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/instructor/:path*"],
}
