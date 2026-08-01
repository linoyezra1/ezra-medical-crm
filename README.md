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
- Prisma 7 + SQLite (מקומי) / PostgreSQL (Railway בפרודקשן)
- ממשק עברית RTL

## מסד נתונים

ברירת מחדל מקומית: SQLite (`file:./dev.db`).

ל־Railway Postgres – השתמשו ב־**Public Networking URL** (לא `*.railway.internal`), החליפו `provider` ל־`postgresql` ב־`prisma/schema.prisma`, והריצו:

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```
