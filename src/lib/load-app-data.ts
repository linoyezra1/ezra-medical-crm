import { prisma } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/demo-data";
import {
  mapClient,
  mapEquipmentDeal,
  mapLead,
  mapSettings,
  mapTask,
} from "@/lib/mappers";
import type { BusinessSettings, Client, EquipmentDeal, Lead, Task } from "@/lib/types";

export type AppData = {
  leads: Lead[];
  equipment: EquipmentDeal[];
  clients: Client[];
  tasks: Task[];
  settings: BusinessSettings;
};

export function emptyAppData(): AppData {
  return {
    leads: [],
    equipment: [],
    clients: [],
    tasks: [],
    settings: DEFAULT_SETTINGS,
  };
}

export async function loadAppData(): Promise<AppData> {
  // During Railway image build, private DB host is unreachable — never fail the build.
  try {
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

    const leads = leadsDb.filter((l) => l.activityType !== "equipment").map(mapLead);

    const equipment = leadsDb
      .filter((l) => l.activityType === "equipment" || l.activityType === "combined")
      .map(mapEquipmentDeal);

    const clients = accounts.map(mapClient);
    const tasks = tasksDb.map(mapTask);
    const businessSettings = mapSettings(settings, assets);

    return { leads, equipment, clients, tasks, settings: businessSettings };
  } catch (error) {
    console.warn("[loadAppData] DB unavailable — using empty state", error);
    return emptyAppData();
  }
}
