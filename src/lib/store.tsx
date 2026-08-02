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
  isExpensesOnlyPatch,
  isParticipantsOnlyPatch,
  leadToDbPayload,
} from "@/lib/lead-payload";
import {
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
  /** מחזיר true רק אחרי שה־DB אישר את העדכון */
  updateLead: (id: string, patch: Partial<Lead>) => Promise<boolean>;
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
        await updateLeadAction(res.data.id, leadToDbPayload(lead, {}));
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

  const syncExpenseDiffs = useCallback(
    async (id: string, current: Lead, nextExpenses: Lead["expenses"]) => {
      const prevIds = new Set(current.expenses.map((e) => e.id));
      const nextIds = new Set(nextExpenses.map((e) => e.id));
      const added = nextExpenses.filter((e) => !prevIds.has(e.id));
      const removed = current.expenses.filter((e) => !nextIds.has(e.id));
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
    },
    [],
  );

  const updateLead = useCallback(
    async (id: string, patch: Partial<Lead>): Promise<boolean> => {
      const current = leads.find((l) => l.id === id);
      if (!current) return false;

      // עדכון משתתפים בלבד (לא טופס עריכה מלא)
      if (isParticipantsOnlyPatch(patch) && patch.participants) {
        const prevIds = new Set(current.participants.map((p) => p.id));
        const nextIds = new Set(patch.participants.map((p) => p.id));
        const added = patch.participants.filter((p) => !prevIds.has(p.id));
        const removed = current.participants.filter((p) => !nextIds.has(p.id));
        setLeads((prev) =>
          prev.map((l) =>
            l.id === id
              ? { ...l, ...patch, updatedAt: new Date().toISOString() }
              : l,
          ),
        );
        try {
          for (const p of added) {
            const res = await addParticipant(id, p.name, p.idNumber);
            if (!res.ok) toast.error(res.error);
          }
          for (const p of removed) {
            await removeParticipant(p.id, id);
          }
          refresh();
          return true;
        } catch {
          toast.error("שגיאה בעדכון משתתפים");
          refresh();
          return false;
        }
      }

      // עדכון הוצאות בלבד
      if (isExpensesOnlyPatch(patch) && patch.expenses) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === id
              ? { ...l, ...patch, updatedAt: new Date().toISOString() }
              : l,
          ),
        );
        try {
          await syncExpenseDiffs(id, current, patch.expenses);
          refresh();
          return true;
        } catch {
          toast.error("שגיאה בעדכון הוצאות");
          refresh();
          return false;
        }
      }

      // שמירה מלאה — אופטימיסטי + API ל־DB
      const previous = current;
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? { ...l, ...patch, updatedAt: new Date().toISOString() }
            : l,
        ),
      );

      try {
        const bypass = Boolean(
          (patch as { conflictBypass?: boolean }).conflictBypass,
        );
        const payload = leadToDbPayload(current, patch);
        const response = await fetch(`/api/leads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, bypassConflict: bypass }),
        });
        const res = (await response.json()) as {
          ok: boolean;
          error?: string;
        };

        if (!response.ok || !res.ok) {
          setLeads((prev) =>
            prev.map((l) => (l.id === id ? previous : l)),
          );
          toast.error(res.error || "שמירת הליד נכשלה");
          refresh();
          return false;
        }

        if (patch.expenses) {
          await syncExpenseDiffs(id, current, patch.expenses);
        }

        refresh();
        return true;
      } catch (err) {
        setLeads((prev) => prev.map((l) => (l.id === id ? previous : l)));
        toast.error(
          err instanceof Error ? err.message : "שגיאה בשמירת הליד",
        );
        refresh();
        return false;
      }
    },
    [leads, refresh, syncExpenseDiffs],
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
        patch.googleReviewUrl != null ||
        patch.tiktokUrl != null ||
        patch.facebookUrl != null ||
        patch.instagramUrl != null;
      if (!hasBusinessFields) return;
      startTransition(async () => {
        await updateSettingsAction({
          businessName: patch.businessName,
          websiteUrl: patch.websiteUrl,
          googleReviewUrl: patch.googleReviewUrl,
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
