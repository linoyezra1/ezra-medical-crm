"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { GraduationCap, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { instructorLogin } from "@/lib/instructor-actions"

export function InstructorLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/instructor/dashboard"

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await instructorLogin(username, password)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`שלום, ${res.data.name}`)
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm gap-0 overflow-hidden rounded-2xl border border-border p-0 shadow-lg">
        <div className="bg-primary px-6 py-8 text-center text-primary-foreground">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary-foreground/15">
            <GraduationCap className="size-7" />
          </div>
          <h1 className="text-xl font-bold">אזור אישי למדריכים</h1>
          <p className="mt-1 text-sm text-primary-foreground/80">
            התחברות למערכת ההדרכות
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="instructor-username">שם משתמש</Label>
            <Input
              id="instructor-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-12 text-base"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructor-password">סיסמה</Label>
            <Input
              id="instructor-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base"
              dir="ltr"
            />
          </div>
          <Button
            type="submit"
            className="h-12 w-full rounded-xl text-base font-bold"
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                מתחבר…
              </>
            ) : (
              "כניסה"
            )}
          </Button>
        </form>
      </Card>
    </div>
  )
}
