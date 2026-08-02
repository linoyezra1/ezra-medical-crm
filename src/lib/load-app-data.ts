import { prisma } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/demo-data";
import {
  mapClient,
  mapEquipmentDeal,
  mapInstructor,
  mapInventoryItem,
  mapLead,
  mapSettings,
  mapTask,
  mapTrainee,
} from "@/lib/mappers";
import type {
  BusinessSettings,
  Client,
  EquipmentDeal,
  InstructorProfile,
  InventoryItem,
  Lead,
  Task,
  Trainee,
} from "@/lib/types";

export type AppData = {
  leads: Lead[];
  equipment: EquipmentDeal[];
  clients: Client[];
  trainees: Trainee[];
  inventory: InventoryItem[];
  instructors: InstructorProfile[];
  tasks: Task[];
  settings: BusinessSettings;
};

export function emptyAppData(): AppData {
  return {
    leads: [],
    equipment: [],
    clients: [],
    trainees: [],
    inventory: [],
    instructors: [],
    tasks: [],
    settings: DEFAULT_SETTINGS,
  };
}

export async function loadAppData(): Promise<AppData> {
  // During Railway image build, private DB host is unreachable — never fail the build.
  try {
    const [
      leadsDb,
      accounts,
      tasksDb,
      settings,
      assets,
      traineesDb,
      inventoryDb,
      instructorsDb,
    ] = await Promise.all([
      prisma.lead.findMany({
        include: {
          participants: true,
          expenses: true,
          trainingSales: { include: { inventoryItem: true } },
          instructorRef: true,
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
      prisma.trainee.findMany({
        include: {
          participants: {
            include: {
              lead: {
                select: {
                  id: true,
                  fullName: true,
                  courseType: true,
                  courseTypeOther: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.inventoryItem.findMany({
        include: {
          components: { include: { child: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.instructor.findMany({ orderBy: { name: "asc" } }),
    ]);

    const leads = leadsDb.filter((l) => l.activityType !== "equipment").map(mapLead);

    const equipment = leadsDb
      .filter((l) => l.activityType === "equipment" || l.activityType === "combined")
      .map(mapEquipmentDeal);

    const clients = accounts.map(mapClient);
    const tasks = tasksDb.map(mapTask);
    const trainees = traineesDb.map(mapTrainee);
    const inventory = inventoryDb.map(mapInventoryItem);
    const instructors = instructorsDb.map(mapInstructor);
    const businessSettings = mapSettings(settings, assets);

    return {
      leads,
      equipment,
      clients,
      trainees,
      inventory,
      instructors,
      tasks,
      settings: businessSettings,
    };
  } catch (error) {
    console.warn("[loadAppData] DB unavailable — using empty state", error);
    return emptyAppData();
  }
}
