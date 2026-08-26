import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_COURSES } from "../src/lib/demo-data";
import { EXAM_QUESTIONS } from "../src/lib/exam-questions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      businessName: "עזרה ורפואה",
      facebookUrl: "https://facebook.com/",
      instagramUrl: "https://instagram.com/",
      tiktokUrl: "https://tiktok.com/",
      lmsLoginUrl: "https://lms.example.com/login",
      calendarEnabled: false,
    },
    update: {},
  });

  // הסרת מיתוג ישן "עזרה!" אם עדיין שמור בהגדרות
  await prisma.settings.updateMany({
    where: {
      id: "default",
      businessName: { in: ["עזרה!", "עזרא ורפואה"] },
    },
    data: { businessName: "עזרה ורפואה" },
  });

  for (const c of DEFAULT_COURSES) {
    const data = {
      title: c.title,
      hours: c.hours,
      audience: c.audience || null,
      durationText: c.durationText || null,
      natureText: c.natureText || null,
      contents: c.contents || null,
      pricingText: c.pricingText || null,
      summaryTemplate: c.summaryTemplate || null,
      bookletUrl: c.bookletUrl || null,
      presentationUrl: c.presentationUrl || null,
      syllabusUrl: c.syllabusUrl || null,
    };
    await prisma.courseAsset.upsert({
      where: { courseType: c.type },
      create: { courseType: c.type, ...data },
      update: data,
    });
  }

  const account = await prisma.account.upsert({
    where: { id: "demo-account" },
    create: {
      id: "demo-account",
      name: "מרכז קהילתי שדמות",
      city: "ירושלים",
      classification: "returning",
    },
    update: {},
  });

  const contact = await prisma.contact.upsert({
    where: { id: "demo-contact" },
    create: {
      id: "demo-contact",
      accountId: account.id,
      fullName: "יוסי כהן",
      phone: "0501234567",
      email: "yossi@example.com",
      role: "מנהל",
    },
    update: {},
  });

  await prisma.lead.upsert({
    where: { id: "demo-lead" },
    create: {
      id: "demo-lead",
      accountId: account.id,
      contactId: contact.id,
      fullName: "יוסי כהן",
      phone: "0501234567",
      email: "yossi@example.com",
      city: "ירושלים",
      leadSource: "returning",
      urgency: "normal",
      activityType: "course",
      courseStatus: "pending",
      courseType: "44_hours",
      courseCategory: "yeshiva_students",
      expectedParticipants: 25,
      sessionsCount: 2,
      sessionDuration: "3_hours",
      pricingModel: "flat_rate",
      agreedPrice: 1700,
      quoteStatus: "sent",
      quoteSentAt: new Date(),
      paymentTerms: "net_30",
      paymentStatus: "pending_official_order",
      location: "אולם הספורט, רחוב הרצל 12",
      notes: "ליד הדגמה",
    },
    update: {},
  });

  const examCount = await prisma.examQuestion.count();
  if (examCount === 0) {
    await prisma.examQuestion.createMany({
      data: EXAM_QUESTIONS.map((q, i) => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points,
        isActive: true,
        orderIndex: i + 1,
      })),
    });
    console.log(`Seeded ${EXAM_QUESTIONS.length} exam questions.`);
  } else {
    console.log(`Exam questions already present (${examCount}) — skipped.`);
  }

  console.log("Seed completed with course summary templates.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
