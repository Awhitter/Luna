import { useState, useCallback } from "react";
import {
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useGetTasksSummary,
  useListDailyContexts,
  useGetCurrentCyclePhase,
  getListTasksQueryKey,
  getGetTasksSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { CheckCircle2, Circle, Plus, Moon, TrendingUp, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";

const categories = [
  { id: "work", label: "Work", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  { id: "home", label: "Home", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  { id: "health", label: "Health", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  { id: "kids", label: "Kids", color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  { id: "self-care", label: "Self-Care", color: "bg-pink-100 text-pink-700 border-pink-200", dot: "bg-pink-500" },
  { id: "food", label: "Food", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
];

const phaseBarColors: Record<string, string> = {
  menstrual: "#f87171",
  follicular: "#fbbf24",
  ovulation: "#34d399",
  luteal: "#a78bfa",
};

function getEnergyColor(level: number | null): string {
  if (!level) return "#e5e7eb";
  if (level >= 8) return "hsl(var(--primary))";
  if (level >= 5) return "hsl(var(--primary) / 0.65)";
  return "hsl(var(--primary) / 0.35)";
}

type RecapData = {
  message: string;
  stats: {
    tasksCompleted: number;
    tasksTotal: number;
    avgSleep: number | null;
    avgEnergy: number | null;
    topMood: string | null;
  };
};

export default function WeekPage() {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useListTasks({ view: "week" });
  const { data: summary } = useGetTasksSummary();
  const { data: dailyContexts = [] } = useListDailyContexts({ limit: 7 });
  const { data: cyclePhase } = useGetCurrentCyclePhase();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();

  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);

  const toggleTask = (id: number, completed: boolean) => {
    updateTask.mutate(
      { id, data: { completed: !completed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "week" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      }
    );
  };

  const addTask = (category: string) => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate(
      {
        data: {
          title: newTaskTitle.trim(),
          category,
          priority: "medium",
          view: "week",
          aiSuggested: false,
        },
      },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          setAddingToCategory(null);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "week" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      }
    );
  };

  const fetchRecap = useCallback(async () => {
    setRecapLoading(true);
    try {
      const res = await fetch("/api/openai/weekly-recap", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as RecapData;
      setRecap(data);
    } catch {
      // silently fail
    } finally {
      setRecapLoading(false);
    }
  }, []);

  // Build 7-day energy chart data
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, "yyyy-MM-dd");
    const ctx = dailyContexts.find((c) => c.date === dateStr);
    return {
      day: format(date, "EEE"),
      dateStr,
      energy: ctx?.energyLevel ?? null,
      sleep: ctx?.sleepHours ?? null,
      mood: ctx?.mood ?? null,
      isToday: dateStr === format(new Date(), "yyyy-MM-dd"),
    };
  });

  const avgEnergy = chartData.filter((d) => d.energy !== null).reduce((sum, d, _, arr) => sum + (d.energy! / arr.length), 0) || null;
  const avgSleep = chartData.filter((d) => d.sleep !== null).reduce((sum, d, _, arr) => sum + (d.sleep! / arr.length), 0) || null;

  const weekSummary = summary?.week;
  const progress = weekSummary && weekSummary.total > 0 ? (weekSummary.completed / weekSummary.total) * 100 : 0;

  const isSunday = new Date().getDay() === 0;

  return (
    <div className="flex flex-col min-h-full">
      <header className="px-5 pt-10 pb-5">
        <h1 className="text-2xl font-serif">This Week</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your weekly rhythm at a glance</p>

        {weekSummary && weekSummary.total > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{weekSummary.completed} of {weekSummary.total} done</span>
              <span className="text-sm text-primary font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 px-5 pb-6 space-y-4">

        {/* Energy Rhythm Card */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Energy Rhythm</span>
            </div>
            <div className="flex items-center gap-3">
              {avgEnergy !== null && (
                <span className="text-xs text-muted-foreground">avg {avgEnergy.toFixed(1)}/10</span>
              )}
              {cyclePhase && cyclePhase.phase !== "unknown" && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{ background: phaseBarColors[cyclePhase.phase] + "22", color: phaseBarColors[cyclePhase.phase] }}
                >
                  {cyclePhase.phase}
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Last 7 days · tap a bar for details</p>

          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as (typeof chartData)[0];
                  return (
                    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-medium text-foreground mb-0.5">{d.day}</p>
                      {d.energy ? <p className="text-muted-foreground">⚡ Energy {d.energy}/10</p> : <p className="text-muted-foreground">No data</p>}
                      {d.sleep ? <p className="text-muted-foreground">🌙 Sleep {d.sleep}h</p> : null}
                      {d.mood ? <p className="text-muted-foreground capitalize">🌸 {d.mood}</p> : null}
                    </div>
                  );
                }}
                cursor={false}
              />
              <Bar dataKey="energy" radius={[4, 4, 0, 0]} minPointSize={3}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.isToday ? "hsl(var(--primary))" : getEnergyColor(entry.energy)}
                    opacity={entry.isToday ? 1 : 0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Sleep + mood mini stats */}
          {(avgSleep !== null || avgEnergy !== null) && (
            <div className="flex gap-3 mt-2 pt-3 border-t border-border">
              {avgSleep !== null && (
                <div className="flex-1 text-center">
                  <p className="text-base font-semibold text-foreground">{avgSleep.toFixed(1)}h</p>
                  <p className="text-[10px] text-muted-foreground">avg sleep</p>
                </div>
              )}
              {avgEnergy !== null && (
                <div className="flex-1 text-center">
                  <p className="text-base font-semibold text-foreground">{avgEnergy.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">avg energy</p>
                </div>
              )}
              {(() => {
                const moods = chartData.filter((d) => d.mood).map((d) => d.mood!);
                const topMood = moods.length > 0
                  ? Object.entries(moods.reduce((acc, m) => ({ ...acc, [m]: (acc[m] || 0) + 1 }), {} as Record<string, number>))
                      .sort((a, b) => b[1] - a[1])[0]?.[0]
                  : null;
                return topMood ? (
                  <div className="flex-1 text-center">
                    <p className="text-base font-semibold text-foreground capitalize">{topMood}</p>
                    <p className="text-[10px] text-muted-foreground">top mood</p>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>

        {/* Luna's Weekly Recap Card */}
        <div className="bg-gradient-to-br from-primary/8 to-primary/4 border border-primary/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <Moon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-primary">Luna's Weekly Recap</p>
                {isSunday && !recap && <p className="text-[10px] text-muted-foreground">It's Sunday — perfect time to reflect ✨</p>}
              </div>
            </div>
            <button
              onClick={fetchRecap}
              disabled={recapLoading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                recap
                  ? "bg-muted text-muted-foreground hover:bg-accent"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {recapLoading ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {recap ? "Refresh" : "Get recap"}
            </button>
          </div>

          {!recap && !recapLoading && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ask Luna to look back at your week — she'll give you a warm summary of what you accomplished, how your energy held up, and what to carry into next week.
            </p>
          )}

          {recapLoading && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Luna is reflecting on your week...</span>
            </div>
          )}

          {recap && !recapLoading && (
            <>
              <p className="text-sm text-foreground/80 leading-relaxed mb-3">{recap.message}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-card/70 rounded-xl p-2.5 text-center">
                  <p className="text-sm font-bold text-foreground">
                    {recap.stats.tasksCompleted}<span className="text-xs font-normal text-muted-foreground">/{recap.stats.tasksTotal}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">tasks done</p>
                </div>
                {recap.stats.avgSleep !== null && (
                  <div className="bg-card/70 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-bold text-foreground">{recap.stats.avgSleep.toFixed(1)}<span className="text-xs font-normal text-muted-foreground">h</span></p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">avg sleep</p>
                  </div>
                )}
                {recap.stats.avgEnergy !== null && (
                  <div className="bg-card/70 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-bold text-foreground">{recap.stats.avgEnergy.toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/10</span></p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">avg energy</p>
                  </div>
                )}
                {recap.stats.topMood && (
                  <div className="bg-card/70 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-bold text-foreground capitalize">{recap.stats.topMood}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">top mood</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Task categories */}
        {categories.map((cat) => {
          const catTasks = tasks.filter((t) => t.category === cat.id);
          const catCompleted = catTasks.filter((t) => t.completed).length;
          const catTotal = catTasks.length;

          return (
            <div key={cat.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className={cn("flex items-center justify-between px-4 py-3 border-b border-border")}>
                <div className="flex items-center gap-2">
                  <span className={cn("w-2.5 h-2.5 rounded-full", cat.dot)} />
                  <span className="font-medium text-sm">{cat.label}</span>
                  {catTotal > 0 && (
                    <span className="text-xs text-muted-foreground">{catCompleted}/{catTotal}</span>
                  )}
                </div>
                <button
                  onClick={() => { setAddingToCategory(cat.id); setNewTaskTitle(""); }}
                  className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-accent transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              <div className="divide-y divide-border">
                {catTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-4 py-3 group"
                  >
                    <button
                      onClick={() => toggleTask(task.id, task.completed)}
                      className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <span className={cn(
                      "text-sm flex-1",
                      task.completed ? "line-through text-muted-foreground" : "text-foreground"
                    )}>
                      {task.title}
                    </span>
                    {task.priority === "high" && !task.completed && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">urgent</span>
                    )}
                  </div>
                ))}

                {addingToCategory === cat.id && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <input
                      autoFocus
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addTask(cat.id);
                        if (e.key === "Escape") { setAddingToCategory(null); setNewTaskTitle(""); }
                      }}
                      placeholder="New task..."
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                    <button onClick={() => addTask(cat.id)} className="text-xs text-primary font-medium">Add</button>
                    <button onClick={() => { setAddingToCategory(null); setNewTaskTitle(""); }} className="text-xs text-muted-foreground">Cancel</button>
                  </div>
                )}

                {catTasks.length === 0 && addingToCategory !== cat.id && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">No tasks yet</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
