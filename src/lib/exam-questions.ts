/**
 * מאגר שאלות מבחן דיגיטלי בעזרה ראשונה (seed + helpers).
 * חשוב: אין לשנות את מלל השאלות או האופציות ב-SEED.
 */

/** ציון מעבר — מתחתיו אדום, ממנו ומעלה ירוק */
export const EXAM_PASS_SCORE = 72

/** גודל ברירת מחדל למבחן */
export const EXAM_TARGET_QUESTION_COUNT = 25

export interface SeedExamQuestion {
  id: number
  question: string
  options: string[]
  correctAnswer: string
  points: number
}

/** שאלה מ-DB / לריצה במבחן */
export interface ExamQuestionDto {
  id: string
  question: string
  options: string[]
  correctAnswer: string
  points: number
  isActive?: boolean
  orderIndex?: number
}

/** מקור seed — מלל מדויק, ללא שינוי */
export const EXAM_QUESTIONS: SeedExamQuestion[] = [
  {
    id: 1,
    question: "מטרת ההחייאה היא:",
    options: [
      "לדאוג שהנפגע לא יקבל דום לב.",
      "לשמור על נפח הריאות.",
      "לשמר מצב של מוות קליני.",
      "לשמר מצב של מוות מוחי.",
    ],
    correctAnswer: "לשמר מצב של מוות קליני.",
    points: 4,
  },
  {
    id: 2,
    question: "אנו נעשה החייאה לכל אדם:",
    options: [
      "מחוסר הכרה.",
      "מחוסר הכרה ונשימה.",
      "שאינו מגיב לקול.",
      "אשר החזיק בחזהו ונפל ארצה מולנו.",
    ],
    correctAnswer: "מחוסר הכרה ונשימה.",
    points: 4,
  },
  {
    id: 3,
    question: "באיזה מצב אניח חסם עורקים לחץ עקיף?",
    options: [
      "דימום קל",
      "קטיעה של רגל ימין",
      "דימום מאסיבי מהצוואר",
      "כל התשובות נכונות",
    ],
    correctAnswer: "קטיעה של רגל ימין",
    points: 4,
  },
  {
    id: 4,
    question: "למי נבצע תמרון היימליך?",
    options: [
      "לילדים לא מבצעים תמרון היימליך",
      "לנפגע מלא, ונשים בהריון",
      "לאדם בהכרה המשתנק ומכחיל, ושאינו משתעל.",
      "לאדם משתעל בצורה חזקה אשר האדים לאחר השיעול",
    ],
    correctAnswer: "לאדם בהכרה המשתנק ומכחיל, ושאינו משתעל.",
    points: 4,
  },
  {
    id: 5,
    question: "על מנת לבדוק הכרה במבוגר יש צורך:",
    options: [
      "ולנער את המטופל, ולצפות לתגובה.",
      "לקרוא לו בקול, וצביטה פיזית בטרפז.",
      "לשפוך עליו מים, במידה לא קם עלי לסטור את החולה.",
      "לסטור את החולה",
    ],
    correctAnswer: "לקרוא לו בקול, וצביטה פיזית בטרפז.",
    points: 4,
  },
  {
    id: 6,
    question: "במידה והתחבושת אישית מאדימה, מה עליי לעשות ?",
    options: [
      "לפתוח ולהדק את התחבושת בצורה חזקה יותר.",
      "להוריד את התחבושת ולהניח חוסם עורקים",
      "להוסיף מעל התחבושת משולש לחץ",
      "לקבע את אזור הדממם",
    ],
    correctAnswer: "להוסיף מעל התחבושת משולש לחץ",
    points: 4,
  },
  {
    id: 7,
    question: "כמה נשימות בדקה יש לאדם בגיל 30?",
    options: ["8-20", "12-20", "30-40", "60-100"],
    correctAnswer: "12-20",
    points: 4,
  },
  {
    id: 8,
    question: "כמה זמן ממוצע אדם נשאר במצב של מוות קליני?",
    options: ["עד חצי שעה", "4-6 דקות", "3 שעות", "עד 6 שעות."],
    correctAnswer: "4-6 דקות",
    points: 4,
  },
  {
    id: 9,
    question: "כיצד מטפלים באדם שהתחשמל?",
    options: [
      "אטפל בכוויות ובדימומים שנוצרו בלבד.",
      "אין לגעת בפצוע שהתחשמל במשך כשעה לפחות.",
      "אנתק זרם ראשי ואתחיל  החייאה בעת הצורך.",
      "בהיעדר נשימה אבצע החייאה.",
    ],
    correctAnswer: "אנתק זרם ראשי ואתחיל  החייאה בעת הצורך.",
    points: 4,
  },
  {
    id: 10,
    question: "כיצד עלי לטפל בילד ששתה חומר ניקוי?",
    options: [
      "אתקשר מיד למוקד הרעלות רמב''ם או למד''א.",
      "אתן ליד לשתות מים, ואתקשר למוקד הרעלות רמב''ם.",
      "אתן לילד לשתות חלב, ואתר למוקד הרעלות רמב''ם.",
      "אם שתה קצת מהחומר, אחכה לבדוק שזה לא מסוכן, במידת הצורך אתקשר למדא.",
    ],
    correctAnswer: "אתקשר מיד למוקד הרעלות רמב''ם או למד''א.",
    points: 4,
  },
  {
    id: 11,
    question: "עבור מה נועד מזרק אפיפן?",
    options: [
      "אלרגיה חריפה ומסכנת חיים.",
      "אירוע מוחי.",
      "התקף לב.",
      "אסטמה.",
    ],
    correctAnswer: "אלרגיה חריפה ומסכנת חיים.",
    points: 4,
  },
  {
    id: 12,
    question: "מה עלי לעשות בהכשת נחש?",
    options: [
      "נקבע את את האיבר, ונפנה לבית חולים.",
      "אניח חסם עורקים, ואצלם את הנחש.",
      "הנפגע יתפנה לבית חולים, ואז נצוד את הנחש.",
      "נקרר את האזור באמצאות קרח, ונפנה לבית חולים.",
    ],
    correctAnswer: "נקבע את את האיבר, ונפנה לבית חולים.",
    points: 4,
  },
  {
    id: 13,
    question: "איך אטפל בחולה אפילפסיה בזמן פרכוס ?",
    options: [
      "אנסה לעצור את הפרכוס על מנת שלא ייחבל כתוצאה מההטחה של גופו ברצפה",
      "לא אנסה לעצור את הפרכוס לעולם.",
      "לא אנסה לעצור את הפרכוס, ארחיק ממנו חפצים מסוכנים ,ארפד את ראשו והזמין עזרה בעת הצורך.",
      "לא אנסה לעצור את הפרכוס ,אלא אחזיק את ראשו בלבד על מנת שלא יוטח ברצפה",
    ],
    correctAnswer:
      "לא אנסה לעצור את הפרכוס, ארחיק ממנו חפצים מסוכנים ,ארפד את ראשו והזמין עזרה בעת הצורך.",
    points: 4,
  },
  {
    id: 14,
    question:
      "במהלך נסיעה בכביש 6 נתקלת בתאונת דרכים, בין כלי רכב לאופנוע, כיצד עלי לפעול?",
    options: [
      "אוודה שאני נמצא במקום בטוח אם צריך הזיז את הנפגעים למקום בטוח , אדווח למדא, ועצור דימום בעת הצורך.",
      "אוודה שאני נמצא במקום בטוח, אדווח למדא, ואחסום את התנועה.",
      "אוודה שאני נמצא במקום בטוח אם צריך הזיז את הנפגעים למקום בטוח , אדווח למדא, הסיר את הקסדה לרוכב אופנוע.",
      "ארוץ לבדוק אם יש נפגעים, אדווח למדא, ואחסום את התנועה.",
    ],
    correctAnswer:
      "אוודה שאני נמצא במקום בטוח אם צריך הזיז את הנפגעים למקום בטוח , אדווח למדא, ועצור דימום בעת הצורך.",
    points: 4,
  },
  {
    id: 15,
    question: "הגעת לאדם אשר נדקר בירך מה עליך לעשות?",
    options: [
      "אין להוציא את הסכין, עלי להניח חסם עורקים.",
      "אין להוציא את הסכין, עלי לעצור את הדם באמצעות לחץ ישיר.",
      "יש להוציא את הסכין מיד, ולהניח חסם עורקים.",
      "יש להוציא את הסכין ברגע שנעצר הדם.",
    ],
    correctAnswer: "אין להוציא את הסכין, עלי להניח חסם עורקים.",
    points: 4,
  },
  {
    id: 16,
    question: "מה התפקיד הדפיברילטור?",
    options: [
      "סיוע מלולי בהחייאה, ובמידת הצורך לתת שוק חשמלי.",
      "לחשמל את הבן אדם.",
      "להחזיר דופק.",
      "לסייע לנו במידה ואדם התעלף.",
    ],
    correctAnswer: "סיוע מלולי בהחייאה, ובמידת הצורך לתת שוק חשמלי.",
    points: 4,
  },
  {
    id: 17,
    question:
      "במהלך טיול שנתי, נקראת לטפל בילדה בת 12, שלא חשה בטוב, הילדה מתלוננת על כאבי ראש, בבדיקה אדמומיות בפנים, סמוק, ויבש,במה אחשוד? וכיצד אטפל?",
    options: [
      "אחשוד להתייבשות, ואתן למטופל לשתות מים, אקח אותו למקום מוצל, והזעיק עזרה.",
      "אחשוד להתייבשות, אתן למטופל לשתות שתיה מתוקה, אקח אותה למקום מוצל בכדי למנוע מכת חום.",
      "אחשוד לזעזוע מח, אני ארגיע אותה, והזעיק עזרה.",
      "אחשוד להתייבשות, אשפוך עליה המון מים, ואתן לה לאכול משהו מתוק",
    ],
    correctAnswer:
      "אחשוד להתייבשות, ואתן למטופל לשתות מים, אקח אותו למקום מוצל, והזעיק עזרה.",
    points: 4,
  },
  {
    id: 18,
    question: "כיצד נטפל בילד שנפך עליו מים רותחים באזור מכוסה {על החולצה} ?",
    options: [
      "לא נסיר את החולצה, נשפוך מים על האזור הכוויה, ונפנה ומוקד רפואי.",
      "נסיר את החולצה מיד, אשפוך המון מים, ונזעיק עזרה עזרה.",
      "לאחר ששטפנו במים, נסיר את החולצה, ונמרח משחה לכוויות.",
      "לא נסיר את החולצה, נמרח משחה לכווית.",
    ],
    correctAnswer:
      "לא נסיר את החולצה, נשפוך מים על האזור הכוויה, ונפנה ומוקד רפואי.",
    points: 4,
  },
  {
    id: 19,
    question: "כיצד נטפל באדם שהתעלף?",
    options: [
      "השכבה החולה, הרמת רגליים, פתיחת נתיב אוויר בעת הצורך.",
      "הושבת החולה, הרמת רגליים, לתקשר למדא.",
      "השכבת החולה, ולשפוך עליו מים",
      "להעיר את הבן האדם, ולהושיב אותו להאט.",
    ],
    correctAnswer: "השכבה החולה, הרמת רגליים, פתיחת נתיב אוויר בעת הצורך.",
    points: 4,
  },
  {
    id: 20,
    question: "היכן עליי להניח את חוסם העורקים.",
    options: [
      'כ-2 אצבעות מעל הפציעה , בערך כ-5 ס"מ',
      'כ-4 אצבעות מעל הפציעה , בערך כ-10 ס"מ.',
      'כ-3 אצבעות מעל הפציעה ,בערך כ-7.5 ס"מ',
      'כאצבע מעל הפציעה , בערך כ-2.5 ס"מ.',
    ],
    correctAnswer: 'כ-4 אצבעות מעל הפציעה , בערך כ-10 ס"מ.',
    points: 4,
  },
  {
    id: 21,
    question: "מה הסכנה בהיפוגלקמיה?",
    options: ["איבוד הכרה", "צניחת בסיס לשון", "דום נשימה", "כל התשובות נכונות"],
    correctAnswer: "כל התשובות נכונות",
    points: 4,
  },
  {
    id: 22,
    question: "כמה דופק לאדם מבוגר בדקה",
    options: ["60-100", "140-160", "30-40", "80-130"],
    correctAnswer: "60-100",
    points: 4,
  },
  {
    id: 23,
    question: "איזה פעולה לא נבצע בפריקת כתף?",
    options: [
      "אחזיר את הכתף למקום.",
      "אניח חסם עורקים.",
      "כל התשובות נכונות.",
      "אנסה לסדר את הכתף באמצעות תחבושות.",
    ],
    correctAnswer: "כל התשובות נכונות.",
    points: 4,
  },
  {
    id: 24,
    question: "מהם סימנים לשבץ מוחי?",
    options: [
      "בלבול.",
      "שיתוק של צד אחד בגוף.",
      "פציאליס {סטייה של צד בפנים}",
      "כל התשובות נכונות",
    ],
    correctAnswer: "כל התשובות נכונות",
    points: 4,
  },
  {
    id: 25,
    question: "היכן ניתן למצוא מכשיר דפיברילטור?",
    options: [
      "קניונים, סופר מרקט, חדרי כושר, חופי ים.",
      "מקום ציבורי מעל 500 איש",
      "מתקן רפואי, קופ''ח.",
      "כל התשובות נכונות",
    ],
    correctAnswer: "כל התשובות נכונות",
    points: 4,
  },
]

export type ExamAnswers = Record<string, string>

/** Fisher–Yates — ערבוב אחיד ללא כפילויות */
export function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/** מחלק נקודות כך שסכום השאלות = 100 */
export function scaleQuestionPoints(
  questions: ExamQuestionDto[],
): ExamQuestionDto[] {
  const n = questions.length
  if (n === 0) return []
  if (n === EXAM_TARGET_QUESTION_COUNT) {
    return questions.map((q) => ({ ...q, points: 4 }))
  }
  const base = Math.floor(100 / n)
  let remainder = 100 - base * n
  return questions.map((q) => {
    const extra = remainder > 0 ? 1 : 0
    if (remainder > 0) remainder -= 1
    return { ...q, points: base + extra }
  })
}

export function scoreExamAnswers(
  questions: ExamQuestionDto[],
  answers: ExamAnswers,
): {
  score: number
  passed: boolean
  unansweredIds: string[]
} {
  const unansweredIds: string[] = []
  let score = 0
  for (const q of questions) {
    const selected = answers[q.id]?.trim()
    if (!selected) {
      unansweredIds.push(q.id)
      continue
    }
    if (selected === q.correctAnswer) score += q.points
  }
  return {
    score,
    passed: score >= EXAM_PASS_SCORE,
    unansweredIds,
  }
}

export function firstUnansweredIndex(
  questions: ExamQuestionDto[],
  answers: ExamAnswers,
): number {
  const idx = questions.findIndex((q) => !answers[q.id]?.trim())
  return idx < 0 ? 0 : idx
}

export function draftAnswerCount(
  answers: ExamAnswers | null | undefined,
): number {
  if (!answers || typeof answers !== "object") return 0
  return Object.values(answers).filter((v) => String(v || "").trim()).length
}

export function parseOptionsJson(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o ?? "").trim()).filter(Boolean)
  }
  return []
}

export function parseIdListJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((id) => String(id ?? "").trim()).filter(Boolean)
}
