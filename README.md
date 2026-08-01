# עזרא ורפואה CRM

מערכת CRM מובייל־פירסט לניהול קורסי עזרה ראשונה, מכירת ציוד ומחזור חיי לקוח.

## הרצה מקומית

```bash
npm install
npm run db:setup
npm run dev
```

פתחו את [http://localhost:3000](http://localhost:3000).

## מה כלול (לפי האפיון)

- פייפליין קורסים + פייפליין ציוד
- טופס ליד בטאבים (קשר / קורס / תמחור / משתתפים / הוצאות)
- שמירה אוטומטית כל 5 שניות
- בדיקת כפילות טלפון
- פעולות מהירות: חיוג, WhatsApp, חוברת, מצגת, LMS
- בדיקת התנגשויות ± שעה בסגירת קורס
- הוצאות קורס + לוח בקרה P&L
- חשבון לקוח 360° + היסטוריה
- משימות מעקב אוטומטיות ל־Net+30/60
- סנכרון Google Calendar (stub – מופעל בהגדרות)

## סטאק

- Next.js (App Router) + TypeScript + Tailwind
- Prisma 7 + PostgreSQL (Railway)
- ממשק עברית RTL

## מסד נתונים (Railway)

1. חברו שירות Postgres לאפליקציה ב־Railway (משתנה `DATABASE_URL` נוצר אוטומטית).
2. בסכמה: `provider = "postgresql"`.
3. ב־Deploy, `npm start` מריץ `prisma db push` ואז `next start`.

מקומית: השתמשו ב־**Public URL** מ־Railway Connect (לא `*.railway.internal`).
