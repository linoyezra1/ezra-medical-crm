import Link from "next/link"
import { Button } from "@/components/ui/button"

export function InstructorUnauthorized() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-bold">נדרשת התחברות</p>
      <p className="text-sm text-muted-foreground">
        הכניסה לאזור האישי מתבצעת עם שם משתמש וסיסמה.
      </p>
      <Button render={<Link href="/instructor/login">מעבר להתחברות</Link>} />
    </div>
  )
}
