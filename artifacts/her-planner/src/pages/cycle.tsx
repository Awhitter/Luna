import { useState } from "react";
import {
  useGetCurrentCyclePhase,
  useListCycleEntries,
  useCreateCycleEntry,
  getGetCurrentCyclePhaseQueryKey,
  getListCycleEntriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Droplets, Flower2, Zap, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";

const phaseIconMap: Record<string, React.ReactNode> = {
  menstrual: <Droplets className="w-8 h-8" />,
  follicular: <Flower2 className="w-8 h-8" />,
  ovulation: <Zap className="w-8 h-8" />,
  luteal: <Moon className="w-8 h-8" />,
  unknown: <Flower2 className="w-8 h-8" />,
};

const phaseStyle: Record<string, { color: string; bg: string }> = {
  menstrual: { color: "text-red-500", bg: "bg-red-50 border-red-100" },
  follicular: { color: "text-yellow-500", bg: "bg-yellow-50 border-yellow-100" },
  ovulation: { color: "text-green-500", bg: "bg-green-50 border-green-100" },
  luteal: { color: "text-purple-500", bg: "bg-purple-50 border-purple-100" },
  unknown: { color: "text-muted-foreground", bg: "bg-muted border-border" },
};

const entryTypeIcons: Record<string, string> = {
  period_start: "🔴",
  period_end: "⭕",
  ovulation: "✨",
  symptom: "🌿",
  note: "📝",
};

export default function CyclePage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { data: phase } = useGetCurrentCyclePhase();
  const { data: entries = [] } = useListCycleEntries({ limit: 10 });
  const createEntry = useCreateCycleEntry();

  const [showLogModal, setShowLogModal] = useState(false);
  const [logType, setLogType] = useState("period_start");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [logNotes, setLogNotes] = useState("");
  const [logSymptoms, setLogSymptoms] = useState("");

  const currentPhase = phase?.phase ?? "unknown";
  const style = phaseStyle[currentPhase];

  const entryTypes = [
    { id: "period_start", label: t.cycle.entryTypes.period_start, icon: "🔴" },
    { id: "period_end", label: t.cycle.entryTypes.period_end, icon: "⭕" },
    { id: "ovulation", label: t.cycle.entryTypes.ovulation, icon: "✨" },
    { id: "symptom", label: t.cycle.entryTypes.symptom, icon: "🌿" },
    { id: "note", label: t.cycle.entryTypes.note, icon: "📝" },
  ];

  const handleLog = () => {
    createEntry.mutate(
      {
        data: {
          entryType: logType as "period_start" | "period_end" | "ovulation" | "symptom" | "note",
          date: logDate,
          notes: logNotes || undefined,
          symptoms: logSymptoms || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowLogModal(false);
          setLogNotes("");
          setLogSymptoms("");
          queryClient.invalidateQueries({ queryKey: getGetCurrentCyclePhaseQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCycleEntriesQueryKey() });
        },
      }
    );
  };

  return (
    <div className="flex flex-col min-h-full">
      <header className="px-5 pt-10 pb-4">
        <h1 className="text-2xl font-serif">{t.cycle.title}</h1>
        <p className="text-sm text-muted-foreground">{t.cycle.subtitle}</p>
      </header>

      <div className="flex-1 px-5 pb-6 space-y-4">
        {/* Current phase card */}
        <div className={cn("rounded-2xl border p-5", style.bg)}>
          <div className="flex items-start gap-4">
            <div className={cn("p-3 rounded-2xl bg-white/60", style.color)}>
              {phaseIconMap[currentPhase]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.cycle.currentPhase}</span>
                {phase?.dayInCycle && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 text-foreground font-medium">
                    {t.cycle.day} {phase.dayInCycle}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-serif mb-1">{t.cycle.phases[currentPhase] ?? currentPhase}</h2>
              {phase?.nextPeriodIn !== null && phase?.nextPeriodIn !== undefined && phase.nextPeriodIn >= 0 && (
                <p className="text-xs text-muted-foreground">{t.cycle.periodIn.replace("{n}", String(phase.nextPeriodIn))}</p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {phase?.energyExpectation && (
              <div className="bg-white/50 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t.cycle.energyLabel}</p>
                <p className="text-sm text-foreground">{phase.energyExpectation}</p>
              </div>
            )}
            {phase?.moodExpectation && (
              <div className="bg-white/50 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t.cycle.moodLabel}</p>
                <p className="text-sm text-foreground">{phase.moodExpectation}</p>
              </div>
            )}
            {phase?.recommendation && (
              <div className="bg-white/50 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t.cycle.tip}</p>
                <p className="text-sm text-foreground">{phase.recommendation}</p>
              </div>
            )}
          </div>
        </div>

        {/* Phase strip */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="text-sm font-medium mb-3">Cycle phases</h3>
          <div className="flex rounded-xl overflow-hidden h-4">
            <div className="bg-red-300" style={{ width: "18%" }} title="Menstrual" />
            <div className="bg-yellow-300" style={{ width: "32%" }} title="Follicular" />
            <div className="bg-green-300" style={{ width: "11%" }} title="Ovulation" />
            <div className="bg-purple-300" style={{ width: "39%" }} title="Luteal" />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{t.cycle.phases.menstrual}</span>
            <span>{t.cycle.phases.follicular}</span>
            <span>{t.cycle.phases.ovulation}</span>
            <span>{t.cycle.phases.luteal}</span>
          </div>
        </div>

        {/* Log button */}
        <button
          onClick={() => setShowLogModal(true)}
          data-testid="btn-log-cycle"
          className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t.cycle.logButton}
        </button>

        {/* Recent entries */}
        {entries.length > 0 && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium">{t.cycle.recentEntries}</h3>
            </div>
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{entryTypeIcons[entry.entryType] || "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.cycle.entryTypes[entry.entryType] ?? entry.entryType}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(entry.date), "MMMM d, yyyy")}</p>
                    {entry.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.notes}</p>}
                    {entry.symptoms && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.symptoms}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Droplets className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t.cycle.noEntries}</p>
          </div>
        )}
      </div>

      {/* Log modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowLogModal(false)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-serif mb-4">Log an entry</h3>
            <div className="flex flex-wrap gap-2 mb-5">
              {entryTypes.map((et) => (
                <button
                  key={et.id}
                  onClick={() => setLogType(et.id)}
                  className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all", logType === et.id ? "bg-primary text-primary-foreground border-primary" : "bg-accent border-border text-foreground")}
                >
                  <span>{et.icon}</span>
                  <span>{et.label}</span>
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Date</label>
              <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-accent border border-border text-sm outline-none focus:border-primary/50" />
            </div>
            {(logType === "symptom" || logType === "note") && (
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {logType === "symptom" ? t.cycle.entryTypes.symptom : t.cycle.entryTypes.note}
                </label>
                <textarea
                  value={logType === "symptom" ? logSymptoms : logNotes}
                  onChange={(e) => logType === "symptom" ? setLogSymptoms(e.target.value) : setLogNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-accent border border-border text-sm outline-none focus:border-primary/50 resize-none"
                />
              </div>
            )}
            <button onClick={handleLog} disabled={createEntry.isPending} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-60">
              {createEntry.isPending ? t.settings.saving : t.settings.save}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
