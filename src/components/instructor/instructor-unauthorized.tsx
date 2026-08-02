export function InstructorUnauthorized() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-bold">קישור לא תקין</p>
      <p className="text-sm text-muted-foreground">
        ממשק המדריך זמין רק דרך הכתובת הייעודית והמאובטחת שנמסרה לכם.
      </p>
    </div>
  )
}
