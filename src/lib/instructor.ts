/** ערך פנימי ל־Select (יציב, לא שם תצוגה) */
export const UNASSIGNED_INSTRUCTOR_VALUE = "__unassigned__"

/** תווית תצוגה — אין מדריך משובץ להדרכה */
export const UNASSIGNED_INSTRUCTOR = "לא שובץ מדריך עדיין"

/** קידומת כותרת משימה אוטומטית לשיבוץ מדריך */
export const ASSIGN_INSTRUCTOR_TASK_PREFIX = "יש לשבץ מדריך להדרכה"

export function isInstructorUnassigned(
  instructor?: string | null,
): boolean {
  const t = instructor?.trim()
  if (!t) return true
  if (t === UNASSIGNED_INSTRUCTOR_VALUE) return true
  return t === UNASSIGNED_INSTRUCTOR
}

export function assignInstructorTaskTitle(
  leadName: string,
  courseLabel: string,
): string {
  const name = leadName.trim() || "הדרכה"
  const course = courseLabel.trim() || "קורס"
  return `${ASSIGN_INSTRUCTOR_TASK_PREFIX} ${name} / ${course}`
}
