/** ערך פנימי ל־Select (יציב, לא שם תצוגה) */
export const UNASSIGNED_INSTRUCTOR_VALUE = "__unassigned__"

/** תווית תצוגה — אין מדריך משובץ להדרכה */
export const UNASSIGNED_INSTRUCTOR = "לא שובץ מדריך עדיין"

/** קידומת כותרת משימה אוטומטית לשיבוץ מדריך */
export const ASSIGN_INSTRUCTOR_TASK_PREFIX = "יש לשבץ מדריך להדרכה"

/** מדריך בעלים — ללא רישום עלות/תעריף */
export const OWNER_INSTRUCTOR_NAME = "יצחק"

/** ערך Select לפתיחת מודאל הוספת מדריך */
export const ADD_INSTRUCTOR_VALUE = "__add_instructor__"

export const ADD_INSTRUCTOR_LABEL = "+ הוסף מדריך חדש / אחר..."

/** אפשרויות שיבוץ מדריך — יצחק תמיד + רשימת DB */
export function buildInstructorSelectOptions(
  instructors: Array<{ name: string; active?: boolean }>,
): string[] {
  const names = new Set<string>([OWNER_INSTRUCTOR_NAME])
  for (const i of instructors) {
    if (i.active !== false && i.name && !isInstructorUnassigned(i.name)) {
      names.add(i.name)
    }
  }
  const rest = [...names]
    .filter((n) => n !== OWNER_INSTRUCTOR_NAME)
    .sort((a, b) => a.localeCompare(b, "he"))
  return [OWNER_INSTRUCTOR_NAME, ...rest]
}

export function isInstructorUnassigned(
  instructor?: string | null,
): boolean {
  const t = instructor?.trim()
  if (!t) return true
  if (t === UNASSIGNED_INSTRUCTOR_VALUE) return true
  return t === UNASSIGNED_INSTRUCTOR
}

/**
 * באנר אדום «לא שובץ מדריך» — רק כשההדרכה בסטטוס «סגרנו נרשם ביומן» (closed).
 * לא מוצג בסטטוס ליד / לפני רישום ביומן.
 */
export function shouldShowUnassignedInstructorWarning(lead: {
  instructor?: string | null
  status?: string | null
}): boolean {
  if (!isInstructorUnassigned(lead.instructor)) return false
  return lead.status === "closed"
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
