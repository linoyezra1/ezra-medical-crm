"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addExpense,
  addParticipant,
  createTask,
  createLead,
  deleteExpense,
  deleteScheduleEvent,
  removeParticipant,
  updateLead as updateLeadAction,
  updateSettings as updateSettingsAction,
} from "@/lib/actions";
import { cleanPhone } from "@/lib/helpers";
import {
  uiStatusToDb,
  type BusinessSettings,
  type Client,
  type EquipmentDeal,
  type InventoryItem,
  type Lead,
  type Task,
  type Trainee,
} from "@/lib/types";
import type { AppData } from "@/lib/load-app-data";

interface AppState {
  leads: Lead[];
  clients: Client[];
  trainees: Trainee[];
  inventory: InventoryItem[];
  equipment: EquipmentDeal[];
  tasks: Task[];
  settings: BusinessSettings;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  getLead: (id: string) => Lead | undefined;
  setLeadParticipants: (id: string, participants: Lead["participants"]) => void;
  addEquipment: (deal: EquipmentDeal) => void;
  updateEquipment: (id: string, patch: Partial<EquipmentDeal>) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeScheduleEvent: (kind: "task" | "training", id: string) => Promise<boolean>;
  getClient: (id: string) => Client | undefined;
  clientLeads: (clientId: string) => Lead[];
  findClientByPhone: (phone: string) => Client | undefined;
  updateTraineeLocal: (id: string, patch: Partial<Trainee>) => void;
  setInventoryLocal: (items: InventoryItem[]) => void;
  updateSettings: (patch: Partial<BusinessSettings>) => void;
  refresh: () => void;
}

const AppContext = createContext<AppState | null>(null);

function toDbPayload(lead: Lead, patch: Partial<Lead>): Record<string, unknown> {
  const merged = { ...lead, ...patch };
  const date = merged.date;
  const time = merged.time;
  const raw: Record<string, unknown> = {
    fullName: merged.name,
    phone: merged.phone,
    email: merged.email || null,
    urgency: merged.urgent ? "urgent" : "normal",
    courseStatus: uiStatusToDb(merged.status),
    courseType: merged.courseType,
    courseTypeOther: merged.courseTypeOther || null,
    courseCategory: merged.category,
    courseCategoryOther: merged.categoryOther || null,
    pricingModel: merged.pricingType === "per_participant" ? "per_participant" : "flat_rate",
    perParticipantRate: merged.pricingType === "per_participant" ? merged.pricePerUnit : null,
    extraParticipantPrice: merged.extraParticipantPrice ?? 50,
    expectedParticipants: merged.participantsCount,
    agreedPrice: merged.totalPrice,
    instructor: merged.instructor || null,
    notes: merged.notes || null,
    kindergartenApproved: Boolean(merged.kindergartenApproval),
    collectCertificateShipping: Boolean(merged.collectCertificateShipping),
    shippingStreet: merged.address.street,
    shippingHouseNo: merged.address.houseNumber,
    shippingCity: merged.address.city,
    shippingZip: merged.address.zip || null,
    city: merged.address.city,
    location: `${merged.address.street} ${merged.address.houseNumber}`.trim() || merged.address.city,
    deliveryMethod: merged.certificateDelivery || "עזרה ורפואה",
    leadSource: merged.customerType === "existing" ? "returning" : "website",
  };

  if (patch.quoteSentAt || merged.quoteSentAt) {
    raw.quoteStatus = "sent";
  }

  if (date && time) {
    const start = new Date(`${date}T${time}`);
    if (!Number.isNaN(start.getTime())) {
      raw.scheduledStart = start.toISOString();
      raw.scheduledEnd = new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString();
    }
  }

  return raw;
}

export function AppProvider({
  initial,
  children,
}: {
  initial: AppData;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [leads, setLeads] = useState(initial.leads);
  const [clients, setClients] = useState(initial.clients);
  const [trainees, setTrainees] = useState(initial.trainees);
  const [inventory, setInventory] = useState(initial.inventory);
  const [equipment, setEquipment] = useState(initial.equipment);
  const [tasks, setTasks] = useState(initial.tasks);
  const [settings, setSettings] = useState(initial.settings);

  useEffect(() => {
    setLeads(initial.leads);
    setClients(initial.clients);
    setTrainees(initial.trainees);
    setInventory(initial.inventory);
    setEquipment(initial.equipment);
    setTasks(initial.tasks);
    setSettings(initial.settings);
  }, [initial]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const setLeadParticipants = useCallback(
    (id: string, participants: Lead["participants"]) => {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                participants,
                participantsCount: Math.max(l.participantsCount, participants.length),
                updatedAt: new Date().toISOString(),
              }
            : l,
        ),
      );
    },
    [],
  );

  const updateTraineeLocal = useCallback((id: string, patch: Partial<Trainee>) => {
    setTrainees((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    );
  }, []);

  const setInventoryLocal = useCallback((items: InventoryItem[]) => {
    setInventory(items);
  }, []);

  const addLead = useCallback(
    (lead: Lead) => {
      setLeads((prev) => [lead, ...prev]);
      startTransition(async () => {
        const fd = new FormData();
        fd.set("fullName", lead.name);
        fd.set("phone", lead.phone);
        fd.set("email", lead.email || "");
        fd.set("city", lead.address.city || "");
        fd.set("urgency", lead.urgent ? "urgent" : "normal");
        fd.set("activityType", "course");
        fd.set("leadSource", lead.customerType === "existing" ? "returning" : "website");
        fd.set("notes", lead.notes || "");
        const res = await createLead(fd);
        if (!res.ok) {
          toast.error(res.error);
          refresh();
          return;
        }
        await updateLeadAction(res.data.id, toDbPayload(lead, {}));
        // replace temp id
        setLeads((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, id: res.data.id } : l))
        );
        refresh();
        router.replace(`/leads/${res.data.id}`);
      });
    },
    [refresh, router]
  );

  const updateLead = useCallback(
    (id: string, patch: Partial<Lead>) => {
      const current = leads.find((l) => l.id === id);
      if (!current) return;

      // Participants diffs
      if (patch.participants) {
        const prevIds = new Set(current.participants.map((p) => p.id));
        const nextIds = new Set(patch.participants.map((p) => p.id));
        const added = patch.participants.filter((p) => !prevIds.has(p.id));
        const removed = current.participants.filter((p) => !nextIds.has(p.id));
        setLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l))
        );
        startTransition(async () => {
          for (const p of added) {
            const res = await addParticipant(id, p.name, p.idNumber);
            if (!res.ok) toast.error(res.error);
          }
          for (const p of removed) {
            await removeParticipant(p.id, id);
          }
          refresh();
        });
        return;
      }

      // Expenses diffs
      if (patch.expenses) {
        const prevIds = new Set(current.expenses.map((e) => e.id));
        const nextIds = new Set(patch.expenses.map((e) => e.id));
        const added = patch.expenses.filter((e) => !prevIds.has(e.id));
        const removed = current.expenses.filter((e) => !nextIds.has(e.id));
        setLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l))
        );
        startTransition(async () => {
          for (const e of added) {
            const res = await addExpense(id, {
              type: e.type,
              amount: e.amount,
              notes: e.hasReceipt ? "קבלה מצורפת" : undefined,
            });
            if (!res.ok) toast.error(res.error);
          }
          for (const e of removed) {
            await deleteExpense(e.id, id);
          }
          refresh();
        });
        return;
      }

      setLeads((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l
        )
      );

      startTransition(async () => {
        const bypass = Boolean((patch as { conflictBypass?: boolean }).conflictBypass);
        const res = await updateLeadAction(id, toDbPayload(current, patch), {
          bypassConflict: bypass,
        });
        if (!res.ok) {
          toast.error(res.error);
        }
        refresh();
      });
    },
    [leads, refresh]
  );

  const getLead = useCallback((id: string) => leads.find((l) => l.id === id), [leads]);

  const addEquipment = useCallback((deal: EquipmentDeal) => {
    setEquipment((prev) => [deal, ...prev]);
  }, []);

  const updateEquipment = useCallback((id: string, patch: Partial<EquipmentDeal>) => {
    setEquipment((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d))
    );
  }, []);

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
    startTransition(async () => {
      const res = await createTask({
        leadId: task.relatedLeadId,
        title: task.title,
        date: task.date || undefined,
        time: task.time,
        notes: task.note,
        assignee: task.assignee,
      });
      if (!res.ok) toast.error(res.error);
      refresh();
    });
  }, [refresh]);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeScheduleEvent = useCallback(
    async (kind: "task" | "training", id: string) => {
      if (kind === "task") {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      } else {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, date: undefined, time: undefined } : l,
          ),
        );
      }
      const res = await deleteScheduleEvent({ kind, id });
      if (!res.ok) {
        toast.error(res.error);
        refresh();
        return false;
      }
      refresh();
      return true;
    },
    [refresh],
  );

  const getClient = useCallback((id: string) => clients.find((c) => c.id === id), [clients]);

  const clientLeads = useCallback(
    (clientId: string) => leads.filter((l) => l.clientId === clientId),
    [leads]
  );

  const findClientByPhone = useCallback(
    (phone: string) => {
      const p = cleanPhone(phone);
      return clients.find((c) => cleanPhone(c.phone) === p);
    },
    [clients]
  );

  const updateSettings = useCallback(
    (patch: Partial<BusinessSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      const hasBusinessFields =
        patch.businessName != null ||
        patch.websiteUrl != null ||
        patch.tiktokUrl != null ||
        patch.facebookUrl != null ||
        patch.instagramUrl != null;
      if (!hasBusinessFields) return;
      startTransition(async () => {
        await updateSettingsAction({
          businessName: patch.businessName,
          websiteUrl: patch.websiteUrl,
          tiktokUrl: patch.tiktokUrl,
          facebookUrl: patch.facebookUrl,
          instagramUrl: patch.instagramUrl,
        });
        refresh();
      });
    },
    [refresh]
  );

  const value = useMemo<AppState>(
    () => ({
      leads,
      clients,
      trainees,
      inventory,
      equipment,
      tasks,
      settings,
      addLead,
      updateLead,
      getLead,
      setLeadParticipants,
      addEquipment,
      updateEquipment,
      addTask,
      updateTask,
      removeScheduleEvent,
      getClient,
      clientLeads,
      findClientByPhone,
      updateTraineeLocal,
      setInventoryLocal,
      updateSettings,
      refresh,
    }),
    [
      leads,
      clients,
      trainees,
      inventory,
      equipment,
      tasks,
      settings,
      addLead,
      updateLead,
      getLead,
      setLeadParticipants,
      addEquipment,
      updateEquipment,
      addTask,
      updateTask,
      removeScheduleEvent,
      getClient,
      clientLeads,
      findClientByPhone,
      updateTraineeLocal,
      setInventoryLocal,
      updateSettings,
      refresh,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
