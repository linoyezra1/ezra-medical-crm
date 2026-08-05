/** ערך פנימי ל־Select (יציב, לא שם תצוגה) */
export const UNASSIGNED_INSTRUCTOR_VALUE = "__unassigned__"

/** תווית תצוגה — אין מדריך משובץ להדרכה */
export const UNASSIGNED_INSTRUCTOR = "לא שובץ מדריך עדיין"

/** קידומת כותרת משימה אוטומטית לשיבוץ מדריך */
export const ASSIGN_INSTRUCTOR_TASK_PREFIX = "יש לשבץ מדריך להדרכה"

/** מדריך בעלים — ללא רישום עלות/תעריף */
export const OWNER_INSTRUCTOR_NAME = "יצחק"

export function isInstructorUnassigned(
  instructor?: string | null,
): boolean {
  const t = instructor?.trim()
  if (!t) return true
  if (t === UNASSIGNED_INSTRUCTOR_VALUE) return true
  return t === UNASSIGNED_INSTRUCTOR
}

/** יצחק — אין תעריף מדריך */
export function isOwnerInstructor(instructor?: string | null): boolean {
  return instructor?.trim() === OWNER_INSTRUCTOR_NAME
}

export function assignInstructorTaskTitle(
  leadName: string,
  courseLabel: string,
): string {
  const name = leadName.trim() || "הדרכה"
  const course = courseLabel.trim() || "קורס"
  return `${ASSIGN_INSTRUCTOR_TASK_PREFIX} ${name} / ${course}`
}
