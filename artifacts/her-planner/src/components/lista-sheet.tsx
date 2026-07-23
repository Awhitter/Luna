import { CheckCircle2, Circle, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";

const categoryColors: Record<string, string> = {
  work: "bg-blue-100 text-blue-700",
  home: "bg-amber-100 text-amber-700",
  health: "bg-green-100 text-green-700",
  kids: "bg-purple-100 text-purple-700",
  "self-care": "bg-pink-100 text-pink-700",
  food: "bg-orange-100 text-orange-700",
};

type TaskRow = {
  id: number;
  title: string;
  category: string;
  completed: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: TaskRow[];
  completedCount: number;
  totalCount: number;
  addingTask: boolean;
  setAddingTask: (v: boolean) => void;
  newTaskTitle: string;
  setNewTaskTitle: (v: string) => void;
  onToggle: (id: number, completed: boolean) => void;
  onAdd: () => void;
  onPickCategory: (cat: string) => void;
  noTasksLabel: string;
  addLabel: string;
};

export function ListaSheet({
  open,
  onClose,
  tasks,
  completedCount,
  totalCount,
  addingTask,
  setAddingTask,
  newTaskTitle,
  setNewTaskTitle,
  onToggle,
  onAdd,
  onPickCategory,
  noTasksLabel,
  addLabel,
}: Props) {
  const { lang } = useLanguage();

  if (!open) return null;

  const title =
    lang === "es" ? "Lista de hoy" : lang === "pt" ? "Lista de hoje" : "Today’s list";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          "relative z-[1] flex max-h-[78dvh] w-full flex-col rounded-t-3xl border border-border bg-card shadow-xl",
          "animate-in slide-in-from-bottom-4 duration-200 md:max-w-md md:rounded-3xl md:slide-in-from-bottom-0 md:fade-in",
        )}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {completedCount}/{totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAddingTask(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
              aria-label={addLabel}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          <div className="mb-3 flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
            {(["home", "food", "kids", "work"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onPickCategory(cat)}
                className={cn(
                  "flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                  categoryColors[cat] || "bg-muted text-muted-foreground",
                )}
              >
                + {cat === "food" ? (lang === "es" ? "súper" : "grocery") : cat}
              </button>
            ))}
          </div>

          {tasks.length === 0 && !addingTask && (
            <p className="py-6 text-center text-xs text-muted-foreground">{noTasksLabel}</p>
          )}

          <div className="space-y-1">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-accent/50"
              >
                <button
                  type="button"
                  onClick={() => onToggle(task.id, task.completed)}
                  className="flex-shrink-0 text-muted-foreground transition-colors hover:text-primary"
                >
                  {task.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <span
                  className={cn(
                    "flex-1 text-sm",
                    task.completed ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {task.title}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    categoryColors[task.category] || "bg-muted text-muted-foreground",
                  )}
                >
                  {task.category}
                </span>
              </div>
            ))}
            {addingTask && (
              <div className="flex items-center gap-2 py-1">
                <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAdd();
                    if (e.key === "Escape") {
                      setAddingTask(false);
                      setNewTaskTitle("");
                    }
                  }}
                  placeholder={
                    lang === "es"
                      ? "Tarea, súper, recado…"
                      : lang === "pt"
                        ? "Tarefa, mercado, recado…"
                        : "Task, grocery, errand…"
                  }
                  className="flex-1 border-b border-primary/30 bg-transparent pb-1 text-sm outline-none placeholder:text-muted-foreground"
                />
                <button type="button" onClick={onAdd} className="text-xs font-medium text-primary">
                  {addLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
