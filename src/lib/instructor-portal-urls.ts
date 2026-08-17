/** כתובות URL לפורטל מדריכים — ללא תלות ב-server */
export function instructorLoginUrl(origin?: string): string {
  const base =
    origin?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000")
  return `${base.replace(/\/$/, "")}/instructor/login`
}

export function instructorDashboardPath(): string {
  return "/instructor/dashboard"
}

export function buildInstructorCredentialsWhatsApp(opts: {
  name: string
  username: string
  password: string
  origin?: string
}): string {
  const portalUrl = instructorLoginUrl(opts.origin)
  return `היי ${opts.name},
להלן פרטי הגישה שלך לאזור האישי במערכת:
🌐 קישור לכניסה: ${portalUrl}
👤 שם משתמש: ${opts.username}
🔑 סיסמה: ${opts.password}

באזור האישי תוכל לצפות בהדרכות ששובצת אליהן, לנווט בקלות, לדווח מכירות ולעקוב אחר השכר שלך.`
}
