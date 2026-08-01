import { prisma } from "@/lib/db";
import {
  mapClient,
  mapEquipmentDeal,
  mapLead,
  mapSettings,
  mapTask,
} from "@/lib/mappers";

export async function loadAppData() {
  const [leadsDb, accounts, tasksDb, settings, assets] = await Promise.all([
    prisma.lead.findMany({
      include: {
        participants: true,
        expenses: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.account.findMany({
      include: { contacts: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.followUpTask.findMany({
      orderBy: { dueDate: "asc" },
    }),
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.courseAsset.findMany(),
  ]);

  const leads = leadsDb
    .filter((l) => l.activityType !== "equipment")
    .map(mapLead);

  const equipment = leadsDb
    .filter((l) => l.activityType === "equipment" || l.activityType === "combined")
    .map(mapEquipmentDeal);

  const clients = accounts.map(mapClient);
  const tasks = tasksDb.map(mapTask);
  const businessSettings = mapSettings(settings, assets);

  return { leads, equipment, clients, tasks, settings: businessSettings };
}
