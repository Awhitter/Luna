import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetProfile,
  useGetTodayContext,
  useCreateDailyContext,
  useGetCurrentCyclePhase,
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  getListTasksQueryKey,
  getGetTasksSummaryQueryKey,
  getGetTodayContextQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Send, Moon, CheckCircle2, Circle, Plus, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";

type ChatMessage = { role: "user" | "assistant"; content: string; streaming?: boolean };

type TaskSuggestion = { title: string; category: string; priority: string; reason: string };
type SuggestionsData = { message: string; suggestions: TaskSuggestion[] };

const categoryColors: Record<string, string> = {
  work: "bg-blue-100 text-blue-700",
  home: "bg-amber-100 text-amber-700",
  health: "bg-green-100 text-green-700",
  kids: "bg-purple-100 text-purple-700",
  "self-care": "bg-pink-100 text-pink-700",
  food: "bg-orange-100 text-orange-700",
};

const MOOD_KEYS = ["happy", "calm", "tired", "anxious", "motivated", "overwhelmed", "grateful", "sad"] as const;

const WIZARD_STEP_KEYS = ["sleep", "energy", "mood"] as const;

let webConvInitPromise: Promise<number> | null = null;

const TODAY_STR = new Date().toISOString().split("T")[0];
const WIZARD_SHOWN_KEY = "luna-wizard-shown";

function hasWizardShownToday(): boolean {
  return localStorage.getItem(WIZARD_SHOWN_KEY) === TODAY_STR;
}
function markWizardShownToday(): void {
  localStorage.setItem(WIZARD_SHOWN_KEY, TODAY_STR);
}

function extractTasksFromText(text: string): {
  cleanText: string;
  taskData: { tasks: Array<{ title: string; category: string; priority: string; view: string }> } | null;
} {
  const marker = "[TASKS:";
  const start = text.indexOf(marker);
  if (start === -1) return { cleanText: text, taskData: null };

  let depth = 0;
  let jsonStart = -1;
  let jsonEnd = -1;

  for (let i = start + marker.length; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) jsonStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }

  if (jsonStart === -1 || jsonEnd === -1) return { cleanText: text, taskData: null };

  const jsonStr = text.slice(jsonStart, jsonEnd + 1);
  const closeIdx = text.indexOf("]", jsonEnd);
  const fullMatch = closeIdx !== -1 ? text.slice(start, closeIdx + 1) : text.slice(start, jsonEnd + 2);

  try {
    const parsed = JSON.parse(jsonStr) as { tasks: Array<{ title: string; category: string; priority: string; view: string }> };
    return { cleanText: text.replace(fullMatch, "").trim(), taskData: parsed };
  } catch {
    return { cleanText: text, taskData: null };
  }
}

export default function TodayPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();

  const { data: profile, isLoading: profileLoading } = useGetProfile();
  const { data: todayCtx, isLoading: ctxLoading } = useGetTodayContext();
  const { data: cyclePhase } = useGetCurrentCyclePhase();
  const { data: tasks = [] } = useListTasks({ view: "today" });
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const createDailyContext = useCreateDailyContext();
  const { data: conversations = [] } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({ sleepHours: 7, energyLevel: 7, mood: "" });

  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!ctxLoading && !profileLoading && profile && !todayCtx && !hasWizardShownToday()) {
      markWizardShownToday();
      setWizardOpen(true);
      setWizardStep(1);
      setWizardData({ sleepHours: 7, energyLevel: 7, mood: "" });
    }
  }, [ctxLoading, profileLoading, profile, todayCtx]);

  useEffect(() => {
    if (!profileLoading && !profile) setLocation("/settings");
  }, [profile, profileLoading, setLocation]);

  useEffect(() => {
    if (!profile) return;
    if (conversations.length > 0 && !conversationId) {
      setConversationId(conversations[0].id);
      return;
    }
    if (conversations.length === 0 && !conversationId) {
      if (webConvInitPromise) return;
      webConvInitPromise = new Promise((resolve, reject) => {
        createConversation.mutate(
          { data: { title: "My Day" } },
          {
            onSuccess: (conv) => {
              setConversationId(conv.id);
              const hour = new Date().getHours();
              const greet = hour < 12 ? t.greetings.morning : hour < 17 ? t.greetings.afternoon : t.greetings.evening;
              const hint = t.greetings.phaseHints[cyclePhase?.phase ?? "unknown"];
              setMessages([{ role: "assistant", content: `${greet}, ${profile.name}! ${hint}` }]);
              resolve(conv.id);
            },
            onError: (err) => {
              webConvInitPromise = null;
              reject(err);
            },
          }
        );
      });
    }
  }, [profile, conversations]);

  useEffect(() => {
    if (conversationId && messages.length === 0 && profile) {
      const hour = new Date().getHours();
      const greet = hour < 12 ? t.greetings.morning : hour < 17 ? t.greetings.afternoon : t.greetings.evening;
      const hint = t.greetings.phaseHints[cyclePhase?.phase ?? "unknown"];
      setMessages([{ role: "assistant", content: `${greet}, ${profile.name}! ${hint}` }]);
    }
  }, [conversationId, profile, cyclePhase, lang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsDismissed(false);
    setAddedSuggestions(new Set());
    try {
      const res = await fetch("/api/openai/suggest-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as SuggestionsData;
      setSuggestions(data);
    } catch {
      // silently fail
    } finally {
      setSuggestionsLoading(false);
    }
  }, [lang]);

  const triggerCheckinConversation = useCallback(async (data: {
    sleepHours: number; energyLevel: number; mood: string; convId: number;
  }) => {
    try {
      const res = await fetch("/api/openai/checkin-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleepHours: data.sleepHours,
          energyLevel: data.energyLevel,
          mood: data.mood,
          language: lang,
          conversationId: data.convId,
        }),
      });
      if (!res.ok) return;
      const { message } = await res.json() as { message: string };
      setMessages((prev) => {
        const withoutGreeting = prev.length === 1 ? [] : prev;
        return [...withoutGreeting, { role: "assistant", content: message }];
      });
    } catch {
      // silently fail
    }
  }, [lang]);

  const saveWizard = () => {
    const today = new Date().toISOString().split("T")[0];
    const payload = {
      date: today,
      sleepHours: wizardData.sleepHours,
      energyLevel: wizardData.energyLevel,
      mood: wizardData.mood || undefined,
    };
    createDailyContext.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setWizardOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetTodayContextQueryKey() });
          fetchSuggestions();
          if (conversationId) {
            triggerCheckinConversation({
              sleepHours: wizardData.sleepHours,
              energyLevel: wizardData.energyLevel,
              mood: wizardData.mood,
              convId: conversationId,
            });
          }
        },
      }
    );
  };

  const handleWizardNext = () => {
    if (wizardStep < 3) setWizardStep((s) => s + 1);
    else saveWizard();
  };

  const openWizardManually = (startStep: number) => {
    setWizardData({
      sleepHours: todayCtx?.sleepHours ?? 7,
      energyLevel: todayCtx?.energyLevel ?? 7,
      mood: todayCtx?.mood ?? "",
    });
    setWizardStep(startStep);
    setWizardOpen(true);
  };

  const addSuggestedTask = (suggestion: TaskSuggestion, index: number) => {
    createTask.mutate(
      { data: { title: suggestion.title, category: suggestion.category, priority: suggestion.priority as "low" | "medium" | "high", view: "today", aiSuggested: true } },
      {
        onSuccess: () => {
          setAddedSuggestions((prev) => new Set(prev).add(index));
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      }
    );
  };

  const parseTasks = useCallback(
    (text: string) => {
      const { cleanText, taskData } = extractTasksFromText(text);
      if (!taskData) return text;
      (taskData.tasks ?? []).forEach((task) => {
        createTask.mutate(
          {
            data: {
              title: task.title,
              category: task.category || "home",
              priority: (task.priority as "low" | "medium" | "high") || "medium",
              view: (task.view as "today" | "week" | "month") || "today",
              aiSuggested: true,
            },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
              queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
            },
          }
        );
      });
      return cleanText;
    },
    [createTask, queryClient]
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming || !conversationId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg, language: lang }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.content) {
                fullText += data.content;
                setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: fullText, streaming: true }; return u; });
              }
            } catch {}
          }
        }
      }
      const displayText = parseTasks(fullText);
      setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: displayText, streaming: false }; return u; });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
    } catch {
      setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: t.chat.errorMessage, streaming: false }; return u; });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, conversationId, parseTasks, queryClient, lang, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleTask = (id: number, completed: boolean) => {
    updateTask.mutate(
      { id, data: { completed: !completed } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) }); queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() }); } }
    );
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate(
      { data: { title: newTaskTitle.trim(), category: "home", priority: "medium", view: "today", aiSuggested: false } },
      { onSuccess: () => { setNewTaskTitle(""); setAddingTask(false); queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) }); queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() }); } }
    );
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>;
  }

  const completedCount = tasks.filter((tk) => tk.completed).length;
  const totalCount = tasks.length;
  const showSuggestions = !suggestionsDismissed && (suggestionsLoading || suggestions !== null);

  const wizardSteps = [
    { id: 1, emoji: "🌙", question: t.checkin.wizard.sleep.question, subtitle: t.checkin.wizard.sleep.subtitle },
    { id: 2, emoji: "⚡", question: t.checkin.wizard.energy.question, subtitle: t.checkin.wizard.energy.subtitle },
    { id: 3, emoji: "🌸", question: t.checkin.wizard.mood.question, subtitle: t.checkin.wizard.mood.subtitle },
  ];
  const currentWizardStep = wizardSteps[wizardStep - 1];
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? t.greetings.morning : hour < 17 ? t.greetings.afternoon : t.greetings.evening;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-10 pb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
          {format(new Date(), "EEEE, MMMM do")}
        </p>
        <h1 className="text-2xl font-serif text-foreground leading-snug">
          {profile ? `${greetWord}, ${profile.name}` : "Welcome"}
        </h1>
        {cyclePhase && cyclePhase.phase !== "unknown" && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {t.phases[cyclePhase.phase] ?? cyclePhase.phase} · {t.cycle.day} {cyclePhase.dayInCycle}
          </div>
        )}
      </header>

      {/* Check-in row */}
      <div className="px-5 flex gap-2 mb-4 overflow-x-auto hide-scrollbar">
        <button onClick={() => openWizardManually(1)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex-shrink-0", todayCtx?.sleepHours ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/30")}>
          🌙 {todayCtx?.sleepHours ? `${todayCtx.sleepHours}h` : t.checkin.logSleep}
        </button>
        <button onClick={() => openWizardManually(2)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex-shrink-0", todayCtx?.energyLevel ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/30")}>
          ⚡ {todayCtx?.energyLevel ? `${t.checkin.logEnergy.replace("Log ", "").replace("Registrar ", "").replace("Registrar ", "")} ${todayCtx.energyLevel}/10` : t.checkin.logEnergy}
        </button>
        <button onClick={() => openWizardManually(3)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex-shrink-0", todayCtx?.mood ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/30")}>
          🌸 {todayCtx?.mood ? (t.moods[todayCtx.mood] ?? todayCtx.mood) : t.checkin.logMood}
        </button>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden px-5">
        <div className="flex-1 overflow-y-auto space-y-3 pb-3 hide-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
                  <Moon className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={cn("max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap", msg.role === "assistant" ? "bg-card border border-border text-foreground rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm")}>
                {msg.content}
                {msg.streaming && <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse rounded-sm" />}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Moon className="w-8 h-8 text-primary" />
              </div>
              <p className="font-medium text-foreground text-sm mb-1">{t.chat.emptyTitle}</p>
              <p className="text-muted-foreground text-xs">{t.chat.emptySubtitle}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="pb-2 pt-2 border-t border-border">
          <div className="flex gap-2 items-end bg-card rounded-2xl border border-border px-3 py-2 focus-within:border-primary/50 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.chat.placeholder}
              className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground min-h-[20px] max-h-24"
              rows={1}
            />
            <button onClick={sendMessage} disabled={!input.trim() || isStreaming} className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Luna Suggestions */}
      {showSuggestions && (
        <div className="px-5 pb-3">
          <div className="bg-gradient-to-br from-primary/8 to-primary/4 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Moon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-primary">{t.luna.suggests}</span>
              </div>
              <button onClick={() => setSuggestionsDismissed(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {suggestionsLoading ? (
              <div className="flex items-center gap-2 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
                <span className="text-xs text-muted-foreground">{t.luna.thinking}</span>
              </div>
            ) : suggestions ? (
              <>
                <p className="text-xs text-foreground/70 mb-3 leading-relaxed">{suggestions.message}</p>
                <div className="space-y-2">
                  {suggestions.suggestions.map((s, i) => (
                    <div key={i} className={cn("flex items-center gap-3 py-2 px-3 rounded-xl transition-all", addedSuggestions.has(i) ? "bg-primary/10 opacity-60" : "bg-card/80 hover:bg-card")}>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", addedSuggestions.has(i) && "line-through text-muted-foreground")}>{s.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", categoryColors[s.category] || "bg-muted text-muted-foreground")}>{s.category}</span>
                        <button onClick={() => addSuggestedTask(s, i)} disabled={addedSuggestions.has(i)} className={cn("w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0", addedSuggestions.has(i) ? "bg-primary/20 text-primary" : "bg-primary text-primary-foreground hover:scale-110 active:scale-95")}>
                          {addedSuggestions.has(i) ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="px-5 py-4 border-t border-border bg-card/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-serif flex items-center gap-2">
            {t.tasks.title}
            {totalCount > 0 && <span className="text-xs font-sans text-muted-foreground font-normal">{completedCount}/{totalCount}</span>}
          </h2>
          <button onClick={() => setAddingTask(true)} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {tasks.length === 0 && !addingTask && (
          <p className="text-xs text-muted-foreground text-center py-3">{t.tasks.noTasks}</p>
        )}
        <div className="space-y-2 max-h-48 overflow-y-auto hide-scrollbar">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-2">
              <button onClick={() => toggleTask(task.id, task.completed)} className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors">
                {task.completed ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5" />}
              </button>
              <span className={cn("text-sm flex-1", task.completed ? "line-through text-muted-foreground" : "text-foreground")}>{task.title}</span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", categoryColors[task.category] || "bg-muted text-muted-foreground")}>{task.category}</span>
            </div>
          ))}
          {addingTask && (
            <div className="flex items-center gap-2 py-1">
              <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <input autoFocus value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); } }} placeholder={t.tasks.placeholder} className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground border-b border-primary/30 pb-1" />
              <button onClick={addTask} className="text-xs text-primary font-medium">{t.tasks.add}</button>
              <button onClick={() => { setAddingTask(false); setNewTaskTitle(""); }} className="text-xs text-muted-foreground">{t.tasks.cancel}</button>
            </div>
          )}
        </div>
      </div>

      {/* Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-card w-full max-w-md rounded-t-3xl px-6 pt-6 pb-10 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-1.5">
                {wizardSteps.map((s) => (
                  <div key={s.id} className={cn("h-1.5 rounded-full transition-all duration-300", s.id === wizardStep ? "w-6 bg-primary" : s.id < wizardStep ? "w-3 bg-primary/40" : "w-3 bg-muted")} />
                ))}
              </div>
              <button onClick={() => { markWizardShownToday(); setWizardOpen(false); }} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <Moon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">{t.luna.morningCheckin}</span>
            </div>

            <div className="mb-6">
              <div className="text-3xl mb-2">{currentWizardStep.emoji}</div>
              <h3 className="text-2xl font-serif leading-tight">{currentWizardStep.question}</h3>
              <p className="text-sm text-muted-foreground mt-1">{currentWizardStep.subtitle}</p>
            </div>

            {wizardStep === 1 && (
              <div className="grid grid-cols-6 gap-2 mb-6">
                {[4, 5, 6, 7, 8, 9].map((h) => (
                  <button key={h} onClick={() => setWizardData((p) => ({ ...p, sleepHours: h }))} className={cn("py-4 rounded-2xl text-sm font-semibold border-2 transition-all flex flex-col items-center gap-0.5", wizardData.sleepHours === h ? "bg-primary text-primary-foreground border-primary scale-105 shadow-md" : "bg-accent border-transparent text-foreground hover:border-primary/30")}>
                    <span className="text-base">{h}</span>
                    <span className="text-[10px] font-normal opacity-70">hrs</span>
                  </button>
                ))}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="mb-6">
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button key={n} onClick={() => setWizardData((p) => ({ ...p, energyLevel: n }))} className={cn("py-3.5 rounded-2xl text-sm font-semibold border-2 transition-all", wizardData.energyLevel === n ? "bg-primary text-primary-foreground border-primary scale-105 shadow-md" : "bg-accent border-transparent text-foreground hover:border-primary/30")}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>{t.checkin.wizard.exhausted}</span>
                  <span>{t.checkin.wizard.fullPower}</span>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 mb-4">
                  {MOOD_KEYS.map((m) => (
                    <button key={m} onClick={() => setWizardData((p) => ({ ...p, mood: p.mood === m ? "" : m }))} className={cn("px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all capitalize", wizardData.mood === m ? "bg-primary text-primary-foreground border-primary" : "bg-accent border-transparent text-foreground hover:border-primary/30")}>
                      {t.moods[m]}
                    </button>
                  ))}
                </div>
                <input
                  value={MOOD_KEYS.includes(wizardData.mood as (typeof MOOD_KEYS)[number]) ? "" : wizardData.mood}
                  onChange={(e) => setWizardData((p) => ({ ...p, mood: e.target.value }))}
                  placeholder={t.checkin.wizard.moodPlaceholder}
                  className="w-full px-4 py-3 rounded-2xl bg-accent border-2 border-transparent text-sm outline-none focus:border-primary/40 placeholder:text-muted-foreground"
                />
              </div>
            )}

            <button onClick={handleWizardNext} disabled={createDailyContext.isPending} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-[0.98]">
              {wizardStep < 3 ? <>{t.checkin.wizard.continue} <ChevronRight className="w-4 h-4" /></> : createDailyContext.isPending ? t.checkin.wizard.saving : t.checkin.wizard.startDay}
            </button>

            <button onClick={() => { markWizardShownToday(); setWizardOpen(false); }} className="w-full text-center text-xs text-muted-foreground mt-3 py-1 hover:text-foreground transition-colors">
              {t.checkin.wizard.skip}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
