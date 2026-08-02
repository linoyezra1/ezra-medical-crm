import type { CourseCatalogItem } from "./types";

export const CATEGORIES = [
  "תלמידי ישיבות",
  "ספנות / רספ״ן",
  "נשק",
  "גנים / בתי ספר",
  "אחר",
];

export const INSTRUCTORS = ["יוסי", "דני", "מיכל", "אבי", "ללא שיוך"];

export const DEFAULT_COURSES: CourseCatalogItem[] = [
  {
    type: "44_hours",
    title: "קורס רענון עזרה ראשונה – 44 שעות",
    hours: 44,
    audience: "הקורס מיועד למי שמעוניין לחדש תעודת עזרה ראשונה בתוקף.",
    durationText: "כ־4 שעות",
    natureText: "קורס ממוקד ופרקטי, הכולל תרגול מעשי באמצעות בובות החייאה מתקדמות.",
    contents: "החייאה\nטיפול במצבי חנק\nמצבי חירום רפואיים\nמצבי חירום ימיים\nעצירת דימומים\nטיפול בסם עורקים\nועוד",
    pricingText: "1,700 ₪ לקבוצה של עד 25 משתתפים",
    summaryTemplate: `סיכום שיחה

שלום {{contactName}},

📘 {{courseTitle}}

👥 למי הקורס מתאים:
{{audience}}

⏱️ משך הקורס:
{{duration}}

🧠🖐️ אופי הקורס:
{{nature}}

📚 תכני הקורס:
{{contents}}

💰 עלות הקורס:
{{pricingText}}`,
    syllabusUrl: "",
    presentationUrl: "",
    bookletUrl: "",
  },
  {
    type: "infant_cpr",
    title: "קורס החייאה תינוקות",
    hours: 0,
    audience: "הקורס מתאים להורים, משפחה וחברים",
    durationText: "כ־3 שעות פחות או יותר",
    natureText: "תרגול מעשי על בובות החייאה מקצועיות",
    contents: "החייאה תינוקות וילדים\nחנק\nמצבי חירום ילדים\nאלרגיה\nחבלות ראש\nעצירת דימום ועוד",
    pricingText: "650 ש״ח כולל מיסים",
    summaryTemplate: `סיכום שיחה 📄
{{courseTitle}} 👶

הקורס מתאים להורים, משפחה וחברים 👨‍👩‍👧‍👦
אורך הקורס {{duration}} ⏱️

תכני הקורס 📚
{{contents}}

עלות {{pricingText}} 💰

סילבוס ישלח בהתאם לצורך`,
    syllabusUrl: "",
    presentationUrl: "",
    bookletUrl: "",
  },
  {
    type: "22_hours",
    title: "קורס עזרה ראשונה 22 למשיטים",
    hours: 22,
    audience: "מיועד למשיטים / ספנות",
    durationText: "לפי דרישות הקורס",
    natureText: "קורס עזרה ראשונה ייעודי",
    contents: "עזרה ראשונה בסיסית בהתאם לדרישות המשיטים",
    pricingText: "450 ₪ להצטרפות לקבוצה · 750 ₪ פרטי · המחיר כולל מיסים",
    summaryTemplate: `סיכום שיחה – {{courseTitle}}

שלום {{contactName}},

עלות 450 להצטרפות לקבוצה
750 פרטי.
המחיר כולל מיסים`,
    syllabusUrl: "",
    presentationUrl: "",
    bookletUrl: "",
  },
  {
    type: "infant_kindergarten",
    title: "קורס החייאת תינוקות (גן)",
    hours: 0,
    audience: "מתאים להורים של הגן",
    durationText: "בין 3-4 שעות תלוי במשתתפים",
    natureText: "מתרגלים על בובות החייאה מקצועיות. הקורס מתבצע אצלכם בגן/בבית, בתאריך שתבחרו, אפשר בשעות הערב המאוחרות.",
    contents: "החייאת תינוקות ותרגול מעשי",
    pricingText: "750 ש״ח",
    summaryTemplate: `היי {{contactName}},
שולחת לך סיכום שיחה
{{courseTitle}}
הקורס מתבצע אצלכם בגן/בבית
בתאריך שתבחרו
אפשר בשעות הערב המאוחרות

עלות הקורס היא {{pricingText}}
הקורס אורך {{duration}}
מתרגלים על בובות החייאה מקצועיות
מתאים להורים של הגן`,
    syllabusUrl: "",
    presentationUrl: "",
    bookletUrl: "",
  },
  {
    type: "60_hours",
    title: "קורס עזרה ראשונה 60 שעות",
    hours: 60,
    audience: "",
    durationText: "",
    natureText: "",
    contents: "",
    pricingText: "",
    summaryTemplate: "",
    syllabusUrl: "",
    presentationUrl: "",
    bookletUrl: "",
  },
  {
    type: "paramedic",
    title: "קורס חובשים",
    hours: 0,
    audience: "",
    durationText: "",
    natureText: "",
    contents: "",
    pricingText: "",
    summaryTemplate: "",
    syllabusUrl: "",
    presentationUrl: "",
    bookletUrl: "",
  },
];

export const DEFAULT_SETTINGS = {
  businessName: "עזרא ורפואה",
  websiteUrl: "",
  tiktokUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  courses: DEFAULT_COURSES,
};
