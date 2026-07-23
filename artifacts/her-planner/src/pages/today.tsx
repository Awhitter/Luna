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
import { Send, Moon, CheckCircle2, Plus, ChevronRight, X, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import { type IntentId } from "@/components/intent-legend";
import { IntentDock } from "@/components/intent-dock";
import { StatusPill } from "@/components/status-pill";
import { ListaSheet } from "@/components/lista-sheet";
import { TypewriterText } from "@/components/typewriter-text";

type ChatMessage = { role: "user" | "assistant"; content: string; streaming?: boolean };

type TaskSuggestion = { title: string; category: string; priority: string; reason: string };
type SuggestionsData = { message: string; suggestions: TaskSuggestion[] };

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

/** Hide incomplete / complete [TASKS:...] payload from the bubble while streaming. */
function hideTasksMarker(text: string): string {
  const marker = "[TASKS:";
  const start = text.indexOf(marker);
  if (start === -1) return text;
  return text.slice(0, start).trimEnd();
}

function clampEnergy(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
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
  const chatListRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const streamTextRef = useRef("");
  const streamRafRef = useRef<number | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({ sleepHours: 7, energyLevel: 3, mood: "" });

  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set());
  const [listOpen, setListOpen] = useState(false);

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
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isStreaming]);

  const onChatScroll = () => {
    const el = chatListRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

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
      // Surface in-thread — never a permanent panel under the chat
      if (data.message?.trim()) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      }
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
    const energyLevel = clampEnergy(wizardData.energyLevel) ?? 3;
    const payload = {
      date: today,
      sleepHours: wizardData.sleepHours,
      energyLevel,
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
              energyLevel,
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
      energyLevel: clampEnergy(todayCtx?.energyLevel) ?? 3,
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

  const paintStreamFrame = useCallback(() => {
    streamRafRef.current = null;
    const visible = hideTasksMarker(streamTextRef.current);
    setMessages((prev) => {
      const u = [...prev];
      if (u.length === 0) return prev;
      u[u.length - 1] = { role: "assistant", content: visible, streaming: true };
      return u;
    });
  }, []);

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
    stickToBottomRef.current = true;
    streamTextRef.current = "";
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMsg },
      { role: "assistant", content: "", streaming: true },
    ]);
    setIsStreaming(true);

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
              streamTextRef.current = fullText;
              if (streamRafRef.current == null) {
                streamRafRef.current = requestAnimationFrame(paintStreamFrame);
              }
            }
          } catch (parseErr) {
            if (!(parseErr instanceof SyntaxError)) {
              // ignore partial JSON; rethrow real stream errors via empty check
            }
          }
        }
      }
      if (streamRafRef.current != null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
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
      if (streamRafRef.current != null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      setMessages((prev) => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: t.chat.errorMessage, streaming: false };
        return u;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, activeIntent, isStreaming, conversationId, parseTasks, queryClient, lang, t, paintStreamFrame]);

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
  const showSuggestionCards =
    !suggestionsDismissed && suggestions !== null && suggestions.suggestions.length > 0;
  const pendingTasks = totalCount - completedCount;

  const wizardSteps = [
    { id: 1, emoji: "🌙", question: t.checkin.wizard.sleep.question, subtitle: t.checkin.wizard.sleep.subtitle },
    { id: 2, emoji: "⚡", question: t.checkin.wizard.energy.question, subtitle: t.checkin.wizard.energy.subtitle },
    { id: 3, emoji: "🌸", question: t.checkin.wizard.mood.question, subtitle: t.checkin.wizard.mood.subtitle },
  ];
  const currentWizardStep = wizardSteps[wizardStep - 1];
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? t.greetings.morning : hour < 17 ? t.greetings.afternoon : t.greetings.evening;

  const moodLabel = todayCtx?.mood ? (t.moods[todayCtx.mood] ?? todayCtx.mood) : null;
  const phaseLabel =
    cyclePhase?.phase && cyclePhase.phase !== "unknown"
      ? `${t.phases[cyclePhase.phase]} · ${cyclePhase.dayInCycle}`
      : null;
  const checkinLabel =
    lang === "es" ? "Registrar" : lang === "pt" ? "Registrar" : "Check in";
  const showPromptChips = messages.length <= 2 && !isStreaming;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[42rem] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3 md:px-5 md:pt-4">
        <div className="min-w-0">
          <h1 className="truncate font-sans text-[1.05rem] font-semibold tracking-tight text-foreground">
            {profile ? `${greetWord}, ${profile.name}` : "Luna"}
          </h1>
          <p className="text-[11px] text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusPill
            sleepHours={todayCtx?.sleepHours}
            energyLevel={clampEnergy(todayCtx?.energyLevel)}
            moodLabel={moodLabel}
            phaseLabel={phaseLabel}
            checkinLabel={checkinLabel}
            onClick={() => openWizardManually(todayCtx ? 1 : 1)}
          />
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={lang === "es" ? "Lista" : "List"}
          >
            <ListTodo className="h-4 w-4" />
            {pendingTasks > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                {pendingTasks}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Thread — sole message scroll */}
      <div
        ref={chatListRef}
        onScroll={onChatScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3 hide-scrollbar md:px-5"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2",
              !msg.streaming && "animate-in fade-in slide-in-from-bottom-2 duration-200",
              msg.role === "user" ? "flex-row-reverse" : "flex-row",
            )}
          >
            {msg.role === "assistant" && (
              <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Moon className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[min(85%,36rem)] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "assistant"
                  ? "rounded-tl-sm border border-border bg-card text-foreground"
                  : "rounded-tr-sm bg-primary text-primary-foreground",
              )}
            >
              {msg.role === "assistant" ? (
                msg.streaming ? (
                  <>
                    {msg.content}
                    <span
                      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] bg-primary align-middle animate-pulse"
                      aria-hidden
                    />
                  </>
                ) : i === 0 && messages.length === 1 ? (
                  <TypewriterText text={msg.content} />
                ) : (
                  msg.content
                )
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {suggestionsLoading && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            {t.luna.thinking}
          </div>
        )}

        {showSuggestionCards && (
          <div className="ml-9 space-y-1.5 rounded-2xl border border-border bg-card p-3 animate-in fade-in duration-200">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">{t.luna.suggests}</span>
              <button
                type="button"
                onClick={() => setSuggestionsDismissed(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {suggestions!.suggestions.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-2 py-1.5",
                  addedSuggestions.has(i) && "opacity-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      addedSuggestions.has(i) && "line-through text-muted-foreground",
                    )}
                  >
                    {s.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addSuggestedTask(s, i)}
                  disabled={addedSuggestions.has(i)}
                  className={cn(
                    "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors",
                    addedSuggestions.has(i)
                      ? "bg-primary/15 text-primary"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {addedSuggestions.has(i) ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer dock */}
      <div className="shrink-0 border-t border-border/80 bg-background/95 px-4 pb-2 pt-2 backdrop-blur-sm md:px-5">
        <IntentDock
          activeIntent={activeIntent}
          showSuggestions={showPromptChips}
          onPickMode={(intentId, draftStem) => {
            setActiveIntent(intentId);
            setInput(draftStem);
            document.getElementById("luna-input")?.focus();
          }}
          onPickSuggestion={(intentId, fullPrompt) => {
            setActiveIntent(intentId);
            setInput(fullPrompt);
            document.getElementById("luna-input")?.focus();
          }}
        />
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 transition-colors focus-within:border-primary/50">
          <textarea
            id="luna-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.chat.placeholder}
            className="max-h-24 min-h-[20px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            rows={1}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ListaSheet
        open={listOpen}
        onClose={() => {
          setListOpen(false);
          setAddingTask(false);
        }}
        tasks={tasks}
        completedCount={completedCount}
        totalCount={totalCount}
        addingTask={addingTask}
        setAddingTask={setAddingTask}
        newTaskTitle={newTaskTitle}
        setNewTaskTitle={setNewTaskTitle}
        onToggle={toggleTask}
        onAdd={addTask}
        onPickCategory={(cat) => {
          setAddingTask(true);
          setNewTaskTitle("");
          (window as unknown as { __lunaQuickCat?: string }).__lunaQuickCat = cat;
        }}
        noTasksLabel={t.tasks.noTasks}
        addLabel={t.tasks.add}
      />

      {wizardOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-t-3xl bg-card px-6 pb-10 pt-6 animate-in slide-in-from-bottom-4 duration-200 md:rounded-3xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex gap-1.5">
                {wizardSteps.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-200",
                      s.id === wizardStep
                        ? "w-6 bg-primary"
                        : s.id < wizardStep
                          ? "w-3 bg-primary/40"
                          : "w-3 bg-muted",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  markWizardShownToday();
                  setWizardOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                <Moon className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">{t.luna.morningCheckin}</span>
            </div>

            <div className="mb-6">
              <div className="mb-2 text-3xl">{currentWizardStep.emoji}</div>
              <h3 className="text-xl font-semibold leading-tight">{currentWizardStep.question}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{currentWizardStep.subtitle}</p>
            </div>

            {wizardStep === 1 && (
              <div className="mb-6 grid grid-cols-6 gap-2">
                {[4, 5, 6, 7, 8, 9].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setWizardData((p) => ({ ...p, sleepHours: h }))}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-2xl border-2 py-4 text-sm font-semibold transition-all",
                      wizardData.sleepHours === h
                        ? "scale-105 border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-transparent bg-accent text-foreground hover:border-primary/30",
                    )}
                  >
                    <span className="text-base">{h}</span>
                    <span className="text-[10px] font-normal opacity-70">hrs</span>
                  </button>
                ))}
              </div>
            )}

            {wizardStep === 2 && (
              <div className="mb-6">
                <div className="mb-3 grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setWizardData((p) => ({ ...p, energyLevel: n }))}
                      className={cn(
                        "rounded-2xl border-2 py-3.5 text-sm font-semibold transition-all",
                        wizardData.energyLevel === n
                          ? "scale-105 border-primary bg-primary text-primary-foreground shadow-md"
                          : "border-transparent bg-accent text-foreground hover:border-primary/30",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between px-1 text-xs text-muted-foreground">
                  <span>{t.checkin.wizard.exhausted}</span>
                  <span>{t.checkin.wizard.fullPower}</span>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="mb-6">
                <div className="mb-4 flex flex-wrap gap-2">
                  {MOOD_KEYS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setWizardData((p) => ({ ...p, mood: p.mood === m ? "" : m }))}
                      className={cn(
                        "rounded-full border-2 px-4 py-2.5 text-sm font-medium capitalize transition-all",
                        wizardData.mood === m
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-transparent bg-accent text-foreground hover:border-primary/30",
                      )}
                    >
                      {t.moods[m]}
                    </button>
                  ))}
                </div>
                <input
                  value={MOOD_KEYS.includes(wizardData.mood as (typeof MOOD_KEYS)[number]) ? "" : wizardData.mood}
                  onChange={(e) => setWizardData((p) => ({ ...p, mood: e.target.value }))}
                  placeholder={t.checkin.wizard.moodPlaceholder}
                  className="w-full rounded-2xl border-2 border-transparent bg-accent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleWizardNext}
              disabled={createDailyContext.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {wizardStep < 3 ? (
                <>
                  {t.checkin.wizard.continue} <ChevronRight className="h-4 w-4" />
                </>
              ) : createDailyContext.isPending ? (
                t.checkin.wizard.saving
              ) : (
                t.checkin.wizard.startDay
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                markWizardShownToday();
                setWizardOpen(false);
              }}
              className="mt-3 w-full py-1 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.checkin.wizard.skip}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
