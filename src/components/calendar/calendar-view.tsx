"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  GraduationCap,
  MapPin,
  Phone,
  Plus,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApp } from "@/lib/store"
import { formatDate, uid } from "@/lib/helpers"
import type { Task } from "@/lib/types"

const TASK_TYPE_LABELS: Record<Task["type"], string> = {
  callback: "חזרה טלפונית",
  collection: "גבייה",
  general: "כללי",
}

export function CalendarView() {
  const { tasks, leads, addTask, updateTask } = useApp()
  const [tab, setTab] = useState<"agenda" | "tasks">("agenda")

  // אירועים = הדרכות מתוזמנות + משימות, מקובצות לפי יום
  const agenda = useMemo(() => {
    type Item =
      | { kind: "training"; id: string; date: string; time?: string; title: string; sub: string }
      | { kind: "task"; id: string; date: string; time?: string; title: string; sub: string; done: boolean }
    const items: Item[] = []
    for (const l of leads) {
      if (l.date && (l.status === "closed" || l.status === "done")) {
        items.push({
          kind: "training",
          id: l.id,
          date: l.date,
          time: l.time,
          title: l.courseType,
          sub: `${l.name} · ${l.address.city || ""}`,
        })
      }
    }
    for (const t of tasks) {
      if (!t.date) continue // משימות ללא תאריך מופיעות בלשונית משימות בלבד
      items.push({
        kind: "task",
        id: t.id,
        date: t.date,
        time: t.time,
        title: t.title,
        sub: `${TASK_TYPE_LABELS[t.type]} · ${t.assignee}`,
        done: t.done,
      })
    }
    items.sort((a, b) => {
      const ta = new Date(`${a.date}T${a.time || "00:00"}`).getTime()
      const tb = new Date(`${b.date}T${b.time || "00:00"}`).getTime()
      return ta - tb
    })
    const map = new Map<string, Item[]>()
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, [])
      map.get(it.date)!.push(it)
    }
    return Array.from(map.entries())
  }, [leads, tasks])

  const openTasks = tasks.filter((t) => !t.done)
  const doneTasks = tasks.filter((t) => t.done)

  return (
    <div>
      <PageHeader
        title="יומן ומשימות"
        subtitle={`${openTasks.length} משימות פתוחות`}
        action={<AddTaskDialog onAdd={addTask} />}
      />

      <div className="px-4 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="agenda" className="text-xs">לוח זמנים</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">משימות</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "agenda" && (
        <div className="space-y-5 p-4">
          {agenda.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              אין אירועים מתוזמנים
            </div>
          )}
          {agenda.map(([day, items]) => (
            <section key={day}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <CalendarDays className="size-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{formatDate(day)}</h2>
              </div>
              <div className="space-y-2">
                {items.map((it) =>
                  it.kind === "training" ? (
                    <Link
                      key={it.id}
                      href={`/leads/${it.id}`}
                      className="flex items-center gap-3 rounded-2xl border-r-4 border-primary bg-card p-3 active:scale-[0.99] transition-transform"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center">
                        <span className="text-sm font-bold text-primary">{it.time || "--:--"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                          <GraduationCap className="size-3.5 text-primary" />
                          {it.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{it.sub}</p>
                      </div>
                    </Link>
                  ) : (
                    <div
                      key={it.id}
                      className="flex items-center gap-3 rounded-2xl border-r-4 border-warning bg-card p-3"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center">
                        <span className="text-sm font-bold text-warning-foreground">{it.time || "--:--"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={"truncate text-sm font-semibold " + (it.done ? "text-muted-foreground line-through" : "text-foreground")}>
                          {it.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{it.sub}</p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            {openTasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => updateTask(t.id, { done: true })} />
            ))}
            {openTasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                אין משימות פתוחות
              </div>
            )}
          </div>
          {doneTasks.length > 0 && (
            <div>
              <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">הושלמו</p>
              <div className="space-y-2">
                {doneTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={() => updateTask(t.id, { done: false })} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <button type="button" onClick={onToggle} className="shrink-0 text-primary">
        {task.done ? (
          <CheckCircle2 className="size-6 text-success" />
        ) : (
          <Circle className="size-6 text-muted-foreground" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={"truncate text-sm font-medium " + (task.done ? "text-muted-foreground line-through" : "text-foreground")}>
          {task.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {task.date
              ? `${formatDate(task.date)}${task.time ? ` · ${task.time}` : ""}`
              : "ללא תאריך"}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5">{TASK_TYPE_LABELS[task.type]}</span>
        </div>
      </div>
      {task.relatedLeadId && (
        <Link href={`/leads/${task.relatedLeadId}`} className="rounded-lg bg-secondary p-2 text-primary">
          <Phone className="size-4" />
        </Link>
      )}
    </div>
  )
}

function AddTaskDialog({ onAdd }: { onAdd: (t: Task) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [type, setType] = useState<Task["type"]>("general")
  const [note, setNote] = useState("")

  const submit = () => {
    if (!title.trim()) return toast.error("יש להזין כותרת למשימה")
    onAdd({
      id: uid("task"),
      title: title.trim(),
      date: date.trim(),
      time: date.trim() && time ? time : undefined,
      assignee: "אני",
      note: note.trim() || undefined,
      done: false,
      type,
    })
    toast.success(
      date.trim() ? "המשימה נוספה ליומן" : "המשימה נשמרה כמשימה פתוחה (ללא תאריך)",
    )
    setOpen(false)
    setTitle("")
    setNote("")
    setDate("")
    setTime("")
    setType("general")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1">
            <Plus className="size-4" /> משימה
          </Button>
        }
      />
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>משימה חדשה</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>תיאור המשימה *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: לחזור לגן שקד" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך (אופציונלי)</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>שעה (אופציונלי)</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                dir="ltr"
                disabled={!date}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>סוג</Label>
            <Select value={type} onValueChange={(v) => setType(v as Task["type"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">כללי</SelectItem>
                <SelectItem value="callback">חזרה טלפונית</SelectItem>
                <SelectItem value="collection">גבייה</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>הערה</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={submit}>הוסף משימה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
