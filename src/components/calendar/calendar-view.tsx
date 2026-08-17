"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  GraduationCap,
  Phone,
  Plus,
  Trash2,
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
import { formatLeadCourseType } from "@/lib/course-type"
import { formatDate, isOpenTask, uid } from "@/lib/helpers"
import { leadCalendarSessions, sessionLocationLabel } from "@/lib/payment"
import { useApp } from "@/lib/store"
import { jerusalemLocalToUtcDate } from "@/lib/timezone"
import type { Lead, Task } from "@/lib/types"
import { cn } from "@/lib/utils"

type PendingDelete = {
  kind: "task" | "training"
  id: string
  title: string
}

const TASK_TYPE_LABELS: Record<Task["type"], string> = {
  callback: "חזרה טלפונית",
  collection: "גבייה",
  general: "כללי",
}

/** מקור המשימה — איש קשר מהליד המשויך, או מקור כללי */
function taskOriginLabel(task: Task, leads: Lead[]): string {
  if (task.relatedLeadId) {
    const lead = leads.find((l) => l.id === task.relatedLeadId)
    const contact = lead?.contactName?.trim() || lead?.name?.trim()
    if (contact) return `איש קשר: ${contact}`
  }
  return "מקור כללי"
}

export function CalendarView() {
  const { tasks, leads, addTask, updateTask, removeScheduleEvent } = useApp()
  const [tab, setTab] = useState<"agenda" | "tasks">("agenda")
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    const ok = await removeScheduleEvent(pendingDelete.kind, pendingDelete.id)
    setDeleting(false)
    if (ok) {
      toast.success("האירוע הוסר מלוח הזמנים")
      setPendingDelete(null)
    }
  }

  // אירועים = הדרכות מתוזמנות (כולל מפגשים מרובים) + משימות
  const agenda = useMemo(() => {
    type Item =
      | {
          kind: "training"
          id: string
          date: string
          time?: string
          title: string
          sub: string
          isPrivate?: boolean
          sessionKey: string
        }
      | {
          kind: "task"
          id: string
          date: string
          time?: string
          title: string
          sub: string
          done: boolean
        }
    const items: Item[] = []
    for (const l of leads) {
      if (
        !["closed", "pending_certificates", "completed"].includes(
          l.status,
        )
      ) {
        continue
      }
      const sessions = leadCalendarSessions(l)
      sessions.forEach((s, idx) => {
        const courseTitle = formatLeadCourseType(l)
        items.push({
          kind: "training",
          id: l.id,
          date: s.date,
          time: s.time,
          title: s.isZoom
            ? `הדרכה - ${courseTitle} - זום`
            : courseTitle,
          sub: `${l.name} · ${
            s.isZoom
              ? s.zoomLink?.trim()
                ? "זום"
                : "זום · חסר קישור"
              : sessionLocationLabel(s) || l.address.city || ""
          }${sessions.length > 1 ? ` · מפגש ${idx + 1}` : ""}`,
          isPrivate: Boolean(l.isPrivateCourse),
          sessionKey: `${l.id}-${s.date}-${s.time}-${idx}`,
        })
      })
    }
    for (const t of tasks) {
      if (!t.date || !isOpenTask(t)) continue
      items.push({
        kind: "task",
        id: t.id,
        date: t.date,
        time: t.time,
        title: t.title,
        sub: taskOriginLabel(t, leads),
        done: t.done,
      })
    }
    items.sort((a, b) => {
      const ta = jerusalemLocalToUtcDate(a.date, a.time || "00:00").getTime()
      const tb = jerusalemLocalToUtcDate(b.date, b.time || "00:00").getTime()
      return ta - tb
    })
    const map = new Map<string, Item[]>()
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, [])
      map.get(it.date)!.push(it)
    }
    return Array.from(map.entries())
  }, [leads, tasks])

  const openTasks = tasks.filter((t) => isOpenTask(t))
  const doneTasks = tasks.filter((t) => !isOpenTask(t))

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
                    <div
                      key={it.sessionKey}
                      className={cn(
                        "flex items-center gap-2 rounded-2xl border-r-4 bg-card p-3",
                        it.isPrivate
                          ? "border-pink-500"
                          : "border-primary",
                      )}
                    >
                      <Link
                        href={`/leads/${it.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 active:scale-[0.99] transition-transform"
                      >
                        <div className="flex w-12 shrink-0 flex-col items-center">
                          <span
                            className={cn(
                              "text-sm font-bold",
                              it.isPrivate
                                ? "text-pink-600"
                                : "text-primary",
                            )}
                          >
                            {it.time || "--:--"}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                            <GraduationCap
                              className={cn(
                                "size-3.5",
                                it.isPrivate
                                  ? "text-pink-600"
                                  : "text-primary",
                              )}
                            />
                            {it.title}
                            {it.isPrivate ? (
                              <span className="text-[10px] font-bold text-pink-600">
                                פרטי
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {it.sub}
                          </p>
                        </div>
                      </Link>
                      <DeleteEventButton
                        onClick={() =>
                          setPendingDelete({
                            kind: "training",
                            id: it.id,
                            title: it.title,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div
                      key={it.id}
                      className="flex items-center gap-2 rounded-2xl border-r-4 border-warning bg-card p-3"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center">
                        <span className="text-sm font-bold text-warning-foreground">
                          {it.time || "--:--"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={
                            "truncate text-sm font-semibold " +
                            (it.done
                              ? "text-muted-foreground line-through"
                              : "text-foreground")
                          }
                        >
                          {it.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{it.sub}</p>
                      </div>
                      <DeleteEventButton
                        onClick={() =>
                          setPendingDelete({
                            kind: "task",
                            id: it.id,
                            title: it.title,
                          })
                        }
                      />
                    </div>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>מחיקת אירוע</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            האם את/ה בטוח/ה שברצונך למחוק אירוע זה מלוח הזמנים?
          </p>
          {pendingDelete?.title ? (
            <p className="rounded-xl bg-secondary/50 px-3 py-2 text-sm font-medium">
              {pendingDelete.title}
            </p>
          ) : null}
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              className="flex-1 rounded-xl"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "מוחק..." : "מחק אירוע"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {tab === "tasks" && (
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            {openTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                origin={taskOriginLabel(t, leads)}
                onToggle={() => updateTask(t.id, { done: true })}
              />
            ))}
            {openTasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                אין משימות פתוחות
              </div>
            )}
          </div>
          {doneTasks.length > 0 && (
            <div>
              <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
                ארכיון משימות
              </p>
              <div className="space-y-2">
                {doneTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    origin={taskOriginLabel(t, leads)}
                    onToggle={() => updateTask(t.id, { done: false })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DeleteEventButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      aria-label="מחק אירוע מלוח הזמנים"
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
    >
      <Trash2 className="size-4" />
    </button>
  )
}

function TaskRow({
  task,
  origin,
  onToggle,
}: {
  task: Task
  origin: string
  onToggle: () => void
}) {
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
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {task.date
              ? `${formatDate(task.date)}${task.time ? ` · ${task.time}` : ""}`
              : "ללא תאריך"}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground/80">
            מקור: {origin}
          </span>
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
