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
import { Send, Moon, CheckCircle2, Circle, Plus, ChevronRight, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import { type IntentId } from "@/components/intent-legend";
import { IntentSwimlane } from "@/components/intent-swimlane";
import { RollingLine } from "@/components/rolling-line";
import { TypewriterText } from "@/components/typewriter-text";

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

  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetProfile();
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
  const [activeIntent, setActiveIntent] = useState<IntentId | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({ sleepHours: 7, energyLevel: 3, mood: "" });

  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set());
  const [moodExpanded, setMoodExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => {
    if (!ctxLoading && !profileLoading && profile && !todayCtx && !hasWizardShownToday()) {
      markWizardShownToday();
      setWizardOpen(true);
      setWizardStep(1);
      setWizardData({ sleepHours: 7, energyLevel: 3, mood: "" });
    }
  }, [ctxLoading, profileLoading, profile, todayCtx]);

  useEffect(() => {
    // 404 (no profile) or hard API failure → settings / onboarding, never infinite spin
    if (!profileLoading && (!profile || profileError)) setLocation("/settings");
  }, [profile, profileLoading, profileError, setLocation]);

  useEffect(() => {
    const draft = localStorage.getItem("luna-pending-draft");
    const intent = localStorage.getItem("luna-pending-intent") as IntentId | null;
    if (draft) {
      setInput(draft);
      localStorage.removeItem("luna-pending-draft");
    }
    if (intent) {
      setActiveIntent(intent);
      localStorage.removeItem("luna-pending-intent");
    }
  }, []);

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
      energyLevel: todayCtx?.energyLevel ?? 3,
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
    const intentId = activeIntent;
    const intentFill =
      intentId && userMsg.length > 0
        ? userMsg.replace(/^(Encuentra formas de |Find ways to |Encontre formas de |Resuelve esto por mí: |Solve this for me: |Resolva isto por mim: |Ayúdame a crear |Help me make |Me ajude a criar |¿Me escuchas sobre…\? |Will you hear me about…\? |Você me escuta sobre…\? |Quiero sentirme |I want to feel |Quero me sentir )/i, "").trim()
        : undefined;
    setInput("");
    setActiveIntent(null);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userMsg,
          language: lang,
          ...(intentId ? { intentId, intentFill } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Chat failed (${res.status})`);
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.error) throw new Error(data.error);
            if (data.content) {
              fullText += data.content;
              setMessages((prev) => {
                const u = [...prev];
                u[u.length - 1] = { role: "assistant", content: fullText, streaming: true };
                return u;
              });
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "stream_failed" && !parseErr.message.includes("JSON")) {
              // ignore partial JSON chunks
            }
          }
        }
      }
      if (!fullText.trim()) throw new Error("Empty reply");
      const displayText = parseTasks(fullText);
      setMessages((prev) => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: displayText, streaming: false };
        return u;
      });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
    } catch {
      setMessages((prev) => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: t.chat.errorMessage, streaming: false };
        return u;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, activeIntent, isStreaming, conversationId, parseTasks, queryClient, lang, t]);

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
    const quickCat = (window as unknown as { __lunaQuickCat?: string }).__lunaQuickCat;
    const category = quickCat || "home";
    (window as unknown as { __lunaQuickCat?: string }).__lunaQuickCat = undefined;
    createTask.mutate(
      {
        data: {
          title: newTaskTitle.trim(),
          category,
          priority: "medium",
          view: "today",
          aiSuggested: false,
        },
      },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          setAddingTask(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      },
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

  const rollingPhrases =
    lang === "es"
      ? [
          "Toca una idea abajo — yo arranco.",
          "¿Cena, dinero, o solo que te escuchen?",
          "Una cosa a la vez. Yo guardo el resto.",
          cyclePhase?.phase && cyclePhase.phase !== "unknown"
            ? `${t.phases[cyclePhase.phase]} · día ${cyclePhase.dayInCycle}`
            : "Hoy cuenta. Estoy aquí.",
        ]
      : lang === "pt"
        ? [
            "Toque uma ideia abaixo — eu começo.",
            "Jantar, dinheiro, ou só ser ouvida?",
            "Uma coisa de cada vez. Eu guardo o resto.",
            cyclePhase?.phase && cyclePhase.phase !== "unknown"
              ? `${t.phases[cyclePhase.phase]} · dia ${cyclePhase.dayInCycle}`
              : "Hoje importa. Estou aqui.",
          ]
        : [
            "Tap an idea below — I’ll start.",
            "Dinner, money, or just be heard?",
            "One thing at a time. I’ll hold the rest.",
            cyclePhase?.phase && cyclePhase.phase !== "unknown"
              ? `${t.phases[cyclePhase.phase]} · day ${cyclePhase.dayInCycle}`
              : "Today counts. I’m here.",
          ];

  const moodLabel = todayCtx?.mood ? (t.moods[todayCtx.mood] ?? todayCtx.mood) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-9 pb-2">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {format(new Date(), "EEEE, MMMM do")}
        </p>
        <h1 className="font-serif text-[1.65rem] leading-snug text-foreground text-balance">
          {profile ? `${greetWord}, ${profile.name}` : "Welcome"}
        </h1>
        <RollingLine
          phrases={rollingPhrases}
          onClick={() => {
            const el = document.getElementById("luna-input");
            el?.focus();
          }}
        />
      </header>

      {/* Compact check-in — mood collapses until tapped */}
      <div className="mb-3 flex items-center gap-1.5 px-5">
        <button
          onClick={() => openWizardManually(1)}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
            todayCtx?.sleepHours
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <span aria-hidden>🌙</span>
          {todayCtx?.sleepHours ? `${todayCtx.sleepHours}h` : "—"}
        </button>
        <button
          onClick={() => openWizardManually(2)}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
            todayCtx?.energyLevel
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <span aria-hidden>⚡</span>
          {todayCtx?.energyLevel ? `${todayCtx.energyLevel}/5` : "—"}
        </button>
        <button
          onClick={() => {
            if (moodLabel) setMoodExpanded((v) => !v);
            else openWizardManually(3);
          }}
          className={cn(
            "flex h-8 min-w-0 max-w-[42%] items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-all",
            moodLabel
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <span aria-hidden>🌸</span>
          <span className={cn("truncate", moodExpanded && "whitespace-normal")}>
            {moodLabel ?? t.checkin.logMood}
          </span>
          {moodLabel && <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", moodExpanded && "rotate-180")} />}
        </button>
      </div>
      {moodExpanded && moodLabel && (
        <button
          type="button"
          onClick={() => openWizardManually(3)}
          className="mx-5 mb-3 rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs leading-relaxed text-foreground animate-in fade-in slide-in-from-top-1 duration-200"
        >
          {moodLabel}
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {lang === "es" ? "Toca para editar" : lang === "pt" ? "Toque para editar" : "Tap to edit"}
          </span>
        </button>
      )}

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden px-5">
        <div className="flex-1 overflow-y-auto space-y-3 pb-3 hide-scrollbar">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
                msg.role === "user" ? "flex-row-reverse" : "flex-row",
              )}
            >
              {msg.role === "assistant" && (
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Moon className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "assistant"
                    ? "rounded-tl-sm border border-border bg-card text-foreground"
                    : "rounded-tr-sm bg-primary text-primary-foreground",
                )}
              >
                {msg.role === "assistant" ? (
                  <TypewriterText text={msg.content} live={Boolean(msg.streaming)} />
                ) : (
                  msg.content
                )}
                {msg.streaming && (
                  <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current" />
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Moon className="h-7 w-7 text-primary" />
              </div>
              <p className="mb-1 text-sm font-medium text-foreground">{t.chat.emptyTitle}</p>
              <p className="text-xs text-muted-foreground">{t.chat.emptySubtitle}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border/80 pb-2 pt-2">
          <IntentSwimlane
            activeIntent={activeIntent}
            onPick={(intentId, fullPrompt) => {
              setActiveIntent(intentId);
              setInput(fullPrompt);
            }}
          />
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 transition-colors focus-within:border-primary/50">
            <textarea
              id="luna-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.chat.placeholder}
              className="min-h-[20px] max-h-24 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
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

      {/* Capture list — tasks, groceries, errands — same inbox */}
      <div className="border-t border-border bg-card/40 px-5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <h2 className="font-serif text-base text-foreground">
              {lang === "es" ? "Lista de hoy" : lang === "pt" ? "Lista de hoje" : "Today’s list"}
            </h2>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {completedCount}/{totalCount}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", listOpen && "rotate-180")} />
          </button>
          <button
            onClick={() => {
              setListOpen(true);
              setAddingTask(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
            aria-label={t.tasks.add}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {listOpen && (
          <div className="animate-in fade-in duration-200">
            <div className="mb-2 flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
              {(["home", "food", "kids", "work"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setAddingTask(true);
                    setNewTaskTitle("");
                    // stash category via title prefix convention — create uses home by default; set via quick add below
                    (window as unknown as { __lunaQuickCat?: string }).__lunaQuickCat = cat;
                  }}
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
              <p className="py-2 text-center text-xs text-muted-foreground">{t.tasks.noTasks}</p>
            )}
            <div className="max-h-40 space-y-1 overflow-y-auto hide-scrollbar">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-accent/50"
                >
                  <button
                    onClick={() => toggleTask(task.id, task.completed)}
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
                      if (e.key === "Enter") addTask();
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
                  <button onClick={addTask} className="text-xs font-medium text-primary">
                    {t.tasks.add}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
                  {[1, 2, 3, 4, 5].map((n) => (
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
