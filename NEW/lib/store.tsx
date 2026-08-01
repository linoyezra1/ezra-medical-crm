"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import {
  DEFAULT_SETTINGS,
  DEMO_CLIENTS,
  DEMO_EQUIPMENT,
  DEMO_LEADS,
  DEMO_TASKS,
} from "./demo-data"
import type {
  BusinessSettings,
  Client,
  EquipmentDeal,
  Lead,
  Task,
} from "./types"

interface AppState {
  leads: Lead[]
  clients: Client[]
  equipment: EquipmentDeal[]
  tasks: Task[]
  settings: BusinessSettings
  addLead: (lead: Lead) => void
  updateLead: (id: string, patch: Partial<Lead>) => void
  getLead: (id: string) => Lead | undefined
  addEquipment: (deal: EquipmentDeal) => void
  updateEquipment: (id: string, patch: Partial<EquipmentDeal>) => void
  addTask: (task: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  getClient: (id: string) => Client | undefined
  clientLeads: (clientId: string) => Lead[]
  findClientByPhone: (phone: string) => Client | undefined
  updateSettings: (patch: Partial<BusinessSettings>) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(DEMO_LEADS)
  const [clients, setClients] = useState<Client[]>(DEMO_CLIENTS)
  const [equipment, setEquipment] = useState<EquipmentDeal[]>(DEMO_EQUIPMENT)
  const [tasks, setTasks] = useState<Task[]>(DEMO_TASKS)
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS)

  const addLead = useCallback((lead: Lead) => {
    setLeads((prev) => [lead, ...prev])
  }, [])

  const updateLead = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, ...patch, updatedAt: new Date().toISOString() }
          : l,
      ),
    )
  }, [])

  const getLead = useCallback(
    (id: string) => leads.find((l) => l.id === id),
    [leads],
  )

  const addEquipment = useCallback((deal: EquipmentDeal) => {
    setEquipment((prev) => [deal, ...prev])
  }, [])

  const updateEquipment = useCallback(
    (id: string, patch: Partial<EquipmentDeal>) => {
      setEquipment((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, ...patch, updatedAt: new Date().toISOString() }
            : d,
        ),
      )
    },
    [],
  )

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev])
  }, [])

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  )

  const clientLeads = useCallback(
    (clientId: string) => leads.filter((l) => l.clientId === clientId),
    [leads],
  )

  const findClientByPhone = useCallback(
    (phone: string) => clients.find((c) => c.phone === phone),
    [clients],
  )

  const updateSettings = useCallback((patch: Partial<BusinessSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const value = useMemo<AppState>(
    () => ({
      leads,
      clients,
      equipment,
      tasks,
      settings,
      addLead,
      updateLead,
      getLead,
      addEquipment,
      updateEquipment,
      addTask,
      updateTask,
      getClient,
      clientLeads,
      findClientByPhone,
      updateSettings,
    }),
    [
      leads,
      clients,
      equipment,
      tasks,
      settings,
      addLead,
      updateLead,
      getLead,
      addEquipment,
      updateEquipment,
      addTask,
      updateTask,
      getClient,
      clientLeads,
      findClientByPhone,
      updateSettings,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
