import { useState } from "react";
import {
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useGetTasksSummary,
  getListTasksQueryKey,
  getGetTasksSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const categories = [
  { id: "work", label: "Work", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  { id: "home", label: "Home", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  { id: "health", label: "Health", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  { id: "kids", label: "Kids", color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  { id: "self-care", label: "Self-Care", color: "bg-pink-100 text-pink-700 border-pink-200", dot: "bg-pink-500" },
  { id: "food", label: "Food", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
];

export default function WeekPage() {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useListTasks({ view: "week" });
  const { data: summary } = useGetTasksSummary();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();

  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

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

  const weekSummary = summary?.week;
  const progress = weekSummary && weekSummary.total > 0 ? (weekSummary.completed / weekSummary.total) * 100 : 0;

  return (
    <div className="flex flex-col min-h-full">
      <header className="px-5 pt-10 pb-5">
        <h1 className="text-2xl font-serif">This Week</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Stay on top of your weekly rhythm</p>

        {weekSummary && weekSummary.total > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{weekSummary.completed} of {weekSummary.total} done</span>
              <span className="text-sm text-primary font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 px-5 pb-6 space-y-4">
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
                  data-testid={`btn-add-${cat.id}-task`}
                  className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-accent transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              <div className="divide-y divide-border">
                {catTasks.map((task) => (
                  <div
                    key={task.id}
                    data-testid={`task-week-${task.id}`}
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
                      data-testid={`input-new-${cat.id}-task`}
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
