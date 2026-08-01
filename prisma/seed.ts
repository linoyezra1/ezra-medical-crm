import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const resolved = url.startsWith("file:") && !path.isAbsolute(url.slice(5))
  ? `file:${path.join(process.cwd(), url.slice(5))}`
  : url;

const adapter = new PrismaBetterSqlite3({ url: resolved });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      businessName: "עזרא ורפואה",
      facebookUrl: "https://facebook.com/",
      instagramUrl: "https://instagram.com/",
      tiktokUrl: "https://tiktok.com/",
      lmsLoginUrl: "https://lms.example.com/login",
      calendarEnabled: false,
    },
    update: {},
  });

  const assets = [
    {
      courseType: "22_hours",
      bookletUrl: "https://example.com/booklets/22h.pdf",
      presentationUrl: "https://docs.google.com/presentation/d/22h",
      presentationFile: "https://example.com/pptx/22h.pptx",
      summaryText: "סיכום קורס 22 שעות – עזרה ראשונה בסיסית.",
    },
    {
      courseType: "44_hours",
      bookletUrl: "https://example.com/booklets/44h.pdf",
      presentationUrl: "https://docs.google.com/presentation/d/44h",
      presentationFile: "https://example.com/pptx/44h.pptx",
      summaryText: "סיכום קורס 44 שעות.",
    },
    {
      courseType: "60_hours",
      bookletUrl: "https://example.com/booklets/60h.pdf",
      presentationUrl: "https://docs.google.com/presentation/d/60h",
      presentationFile: "https://example.com/pptx/60h.pptx",
      summaryText: "סיכום קורס 60 שעות.",
    },
    {
      courseType: "paramedic",
      bookletUrl: "https://example.com/booklets/paramedic.pdf",
      presentationUrl: "https://docs.google.com/presentation/d/paramedic",
      presentationFile: "https://example.com/pptx/paramedic.pptx",
      summaryText: "סיכום קורס חובשים.",
    },
  ];

  for (const a of assets) {
    await prisma.courseAsset.upsert({
      where: { courseType: a.courseType },
      create: a,
      update: a,
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
      courseType: "22_hours",
      courseCategory: "yeshiva_students",
      expectedParticipants: 25,
      sessionsCount: 2,
      sessionDuration: "3_hours",
      pricingModel: "per_participant",
      perParticipantRate: 120,
      agreedPrice: 3000,
      quoteStatus: "sent",
      quoteSentAt: new Date(),
      paymentTerms: "net_30",
      paymentStatus: "pending_official_order",
      location: "אולם הספורט, רחוב הרצל 12",
      notes: "ליד הדגמה מהסיד",
    },
    update: {},
  });

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
