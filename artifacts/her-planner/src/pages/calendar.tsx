import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import WeekPage from "@/pages/week";
import MonthPage from "@/pages/month";

/** Week + Month in one tab — segmented control, no duplicate nav. */
export default function CalendarPage() {
  const { t, lang } = useLanguage();
  const [mode, setMode] = useState<"week" | "month">("week");

  const labels =
    lang === "es"
      ? { week: "Semana", month: "Mes", title: "Calendario" }
      : lang === "pt"
        ? { week: "Semana", month: "Mês", title: "Calendário" }
        : { week: "Week", month: "Month", title: "Calendar" };

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/90 px-5 pb-3 pt-10 backdrop-blur-md">
        <h1 className="font-serif text-2xl text-foreground">{labels.title}</h1>
        <div className="mt-3 inline-flex rounded-full bg-secondary p-1">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200",
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "week" ? labels.week : labels.month}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {mode === "week" ? t.week.subtitle : t.month.subtitle}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "week" ? <WeekPage embedded /> : <MonthPage embedded />}
      </div>
    </div>
  );
}
