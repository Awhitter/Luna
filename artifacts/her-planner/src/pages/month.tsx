import { useState } from "react";
import {
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useGetCurrentCyclePhase,
  useListCycleEntries,
  getListTasksQueryKey,
  getGetTasksSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";

const phaseColors: Record<string, string> = {
  menstrual: "bg-red-100 text-red-600",
  follicular: "bg-yellow-100 text-yellow-600",
  ovulation: "bg-green-100 text-green-600",
  luteal: "bg-purple-100 text-purple-600",
};

const phaseDotColors: Record<string, string> = {
  menstrual: "bg-red-400",
  follicular: "bg-yellow-400",
  ovulation: "bg-green-400",
  luteal: "bg-purple-400",
};

function getCycleDayPhase(dayOffset: number, cycleLength = 28, periodLength = 5) {
  const day = ((dayOffset % cycleLength) + cycleLength) % cycleLength + 1;
  if (day <= periodLength) return "menstrual";
  if (day <= 13) return "follicular";
  if (day <= 16) return "ovulation";
  return "luteal";
}

export default function MonthPage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const { data: tasks = [] } = useListTasks({ view: "month" });
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const { data: cycleEntries = [] } = useListCycleEntries({ limit: 3 });
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const lastPeriodEntry = cycleEntries.find((e) => e.entryType === "period_start");
  const lastPeriodDate = lastPeriodEntry ? new Date(lastPeriodEntry.date) : null;
  const cycleLength = 28;

  const getDayPhase = (day: Date) => {
    if (!lastPeriodDate) return null;
    const diffDays = Math.floor((day.getTime() - lastPeriodDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return null;
    return getCycleDayPhase(diffDays, cycleLength);
  };

  const selectedDayTasks = selectedDay
    ? tasks.filter((tk) => {
        if (tk.dueDate) return isSameDay(new Date(tk.dueDate), selectedDay);
        return isToday(selectedDay);
      })
    : [];

  const toggleTask = (id: number, completed: boolean) => {
    updateTask.mutate(
      { id, data: { completed: !completed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "month" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      }
    );
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate(
      {
        data: {
          title: newTaskTitle.trim(),
          category: "home",
          priority: "medium",
          view: "month",
          dueDate: selectedDay ? selectedDay.toISOString().split("T")[0] : undefined,
          aiSuggested: false,
        },
      },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          setAddingTask(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "month" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      }
    );
  };

  const firstDayOfWeek = monthStart.getDay();

  return (
    <div className="flex flex-col min-h-full">
      <header className="px-5 pt-10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif">{format(currentDate, "MMMM yyyy")}</h1>
            <p className="text-sm text-muted-foreground">{t.month.subtitle}</p>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {lastPeriodDate && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {Object.entries(phaseColors).map(([phase]) => (
              <div key={phase} className="flex items-center gap-1">
                <span className={cn("w-2 h-2 rounded-full", phaseDotColors[phase])} />
                <span className="text-xs text-muted-foreground capitalize">{t.phases[phase] ?? phase}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="px-5 pb-4">
        <div className="grid grid-cols-7 mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
          {days.map((day) => {
            const phase = getDayPhase(day);
            const dayTasks = tasks.filter((tk) => tk.dueDate && isSameDay(new Date(tk.dueDate), day));
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const todayDay = isToday(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                data-testid={`day-${format(day, "yyyy-MM-dd")}`}
                className={cn(
                  "relative flex flex-col items-center justify-start h-10 rounded-xl text-xs font-medium transition-all",
                  isSelected ? "bg-primary text-primary-foreground" : todayDay ? "border-2 border-primary text-primary" : "hover:bg-accent",
                  phase && !isSelected ? phaseColors[phase] + " opacity-80" : ""
                )}
              >
                <span className="mt-1.5">{format(day, "d")}</span>
                {dayTasks.length > 0 && !isSelected && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="flex-1 px-5 pb-6">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium">{isToday(selectedDay) ? t.month.allMonthTasks : format(selectedDay, "MMMM d")}</h3>
              <button onClick={() => setAddingTask(true)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-accent transition-colors">
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="divide-y divide-border">
              {(isToday(selectedDay) ? tasks : selectedDayTasks).map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => toggleTask(task.id, task.completed)} className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors">
                    {task.completed ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5" />}
                  </button>
                  <span className={cn("text-sm flex-1", task.completed ? "line-through text-muted-foreground" : "")}>{task.title}</span>
                </div>
              ))}

              {addingTask && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <input
                    autoFocus
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addTask(); if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); } }}
                    placeholder={t.tasks.placeholder}
                    className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                  <button onClick={addTask} className="text-xs text-primary font-medium">{t.tasks.add}</button>
                  <button onClick={() => { setAddingTask(false); setNewTaskTitle(""); }} className="text-xs text-muted-foreground">{t.tasks.cancel}</button>
                </div>
              )}

              {tasks.length === 0 && !addingTask && (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground">{t.month.noTasks}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
