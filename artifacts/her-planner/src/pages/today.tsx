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

type ChatMessage = { role: "user" | "assistant"; content: string; streaming?: boolean };

type TaskSuggestion = {
  title: string;
  category: string;
  priority: string;
  reason: string;
};

type SuggestionsData = {
  message: string;
  suggestions: TaskSuggestion[];
};

const categoryColors: Record<string, string> = {
  work: "bg-blue-100 text-blue-700",
  home: "bg-amber-100 text-amber-700",
  health: "bg-green-100 text-green-700",
  kids: "bg-purple-100 text-purple-700",
  "self-care": "bg-pink-100 text-pink-700",
  food: "bg-orange-100 text-orange-700",
};

const MOODS = ["happy", "calm", "tired", "anxious", "motivated", "overwhelmed", "grateful", "sad"] as const;

const WIZARD_STEPS = [
  { id: 1, key: "sleep" as const, emoji: "🌙", question: "How did you sleep?", subtitle: "Hours last night" },
  { id: 2, key: "energy" as const, emoji: "⚡", question: "Energy level?", subtitle: "How's your body feeling?" },
  { id: 3, key: "mood" as const, emoji: "🌸", question: "What's your mood?", subtitle: "Be honest — this is just for you" },
];

function getGreeting(name: string, phase?: string) {
  const hour = new Date().getHours();
  const t = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const hints: Record<string, string> = {
    menstrual: "Rest is on the list too — I've got you.",
    follicular: "Your energy's building. Let's use it well!",
    ovulation: "You're in your power today. Big things ahead?",
    luteal: "Let's keep it gentle and manageable today.",
    unknown: "Let's make today count, together.",
  };
  return `${t}, ${name}! ${hints[phase ?? "unknown"]}`;
}

export default function TodayPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useGetProfile();
  const { data: todayCtx, isLoading: ctxLoading } = useGetTodayContext();
  const { data: cyclePhase } = useGetCurrentCyclePhase();
  const { data: tasks = [] } = useListTasks({ view: "today" });
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const createDailyContext = useCreateDailyContext();
  const { data: conversations = [] } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Task add state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // Daily check-in wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({ sleepHours: 7, energyLevel: 7, mood: "" });
  const [wizardAutoOpened, setWizardAutoOpened] = useState(false);

  // Luna suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<number>>(new Set());

  // Auto-open wizard once per day if no check-in yet
  useEffect(() => {
    if (!ctxLoading && !profileLoading && profile && !todayCtx && !wizardAutoOpened) {
      setWizardAutoOpened(true);
      setWizardOpen(true);
      setWizardStep(1);
      setWizardData({ sleepHours: 7, energyLevel: 7, mood: "" });
    }
  }, [ctxLoading, profileLoading, profile, todayCtx, wizardAutoOpened]);

  // Redirect to settings if no profile
  useEffect(() => {
    if (!profileLoading && !profile) setLocation("/settings");
  }, [profile, profileLoading, setLocation]);

  // Set up conversation
  useEffect(() => {
    if (profile && conversations.length > 0 && !conversationId) {
      setConversationId(conversations[0].id);
    }
  }, [profile, conversations, conversationId]);

  useEffect(() => {
    if (profile && conversations.length === 0 && !conversationId) {
      createConversation.mutate(
        { data: { title: "My Day" } },
        {
          onSuccess: (conv) => {
            setConversationId(conv.id);
            setMessages([{ role: "assistant", content: getGreeting(profile.name, cyclePhase?.phase) }]);
          },
        }
      );
    }
  }, [profile, conversations]);

  useEffect(() => {
    if (conversationId && messages.length === 0 && profile) {
      setMessages([{ role: "assistant", content: getGreeting(profile.name, cyclePhase?.phase) }]);
    }
  }, [conversationId, profile, cyclePhase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsDismissed(false);
    setAddedSuggestions(new Set());
    try {
      const res = await fetch("/api/openai/suggest-tasks", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as SuggestionsData;
      setSuggestions(data);
    } catch {
      // silently fail — suggestions are a bonus
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

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
        },
      }
    );
  };

  const handleWizardNext = () => {
    if (wizardStep < 3) {
      setWizardStep((s) => s + 1);
    } else {
      saveWizard();
    }
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
      {
        data: {
          title: suggestion.title,
          category: suggestion.category,
          priority: suggestion.priority as "low" | "medium" | "high",
          view: "today",
          aiSuggested: true,
        },
      },
      {
        onSuccess: () => {
          setAddedSuggestions((prev) => new Set(prev).add(index));
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
          queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        },
      }
    );
  };

  // AI chat
  const parseTasks = useCallback(
    (text: string) => {
      const match = text.match(/\[TASKS:(\{.*?\})\]/s);
      if (!match) return text;
      try {
        const parsed = JSON.parse(match[1]) as { tasks: Array<{ title: string; category: string; priority: string; view: string }> };
        parsed.tasks.forEach((t) => {
          createTask.mutate(
            { data: { title: t.title, category: t.category, priority: t.priority as "low" | "medium" | "high", view: (t.view as "today" | "week" | "month") || "today", aiSuggested: true } },
            { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) }); queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() }); } }
          );
        });
      } catch {}
      return text.replace(/\[TASKS:\{.*?\}\]/s, "").trim();
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
        body: JSON.stringify({ content: userMsg }),
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
      setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: "Sorry, I had a little hiccup. Try again?", streaming: false }; return u; });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, conversationId, parseTasks, queryClient]);

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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const currentWizardStep = WIZARD_STEPS[wizardStep - 1];
  const showSuggestions = !suggestionsDismissed && (suggestionsLoading || suggestions !== null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-10 pb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
          {format(new Date(), "EEEE, MMMM do")}
        </p>
        <h1 className="text-2xl font-serif text-foreground leading-snug">
          {profile
            ? `${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, ${profile.name}`
            : "Welcome"}
        </h1>
        {cyclePhase && cyclePhase.phase !== "unknown" && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {cyclePhase.phase.charAt(0).toUpperCase() + cyclePhase.phase.slice(1)} phase · Day {cyclePhase.dayInCycle}
          </div>
        )}
      </header>

      {/* Check-in summary row */}
      <div className="px-5 flex gap-2 mb-4 overflow-x-auto hide-scrollbar">
        <button
          onClick={() => openWizardManually(1)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex-shrink-0",
            todayCtx?.sleepHours
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-card border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          🌙 {todayCtx?.sleepHours ? `${todayCtx.sleepHours}h sleep` : "Log sleep"}
        </button>
        <button
          onClick={() => openWizardManually(2)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex-shrink-0",
            todayCtx?.energyLevel
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-card border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          ⚡ {todayCtx?.energyLevel ? `Energy ${todayCtx.energyLevel}/10` : "Log energy"}
        </button>
        <button
          onClick={() => openWizardManually(3)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex-shrink-0",
            todayCtx?.mood
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-card border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          🌸 {todayCtx?.mood || "Log mood"}
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden px-5">
        <div className="flex-1 overflow-y-auto space-y-3 pb-3 hide-scrollbar">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
                  <Moon className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  msg.role === "assistant"
                    ? "bg-card border border-border text-foreground rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                )}
              >
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
              <p className="font-medium text-foreground text-sm mb-1">Luna is here for you ✨</p>
              <p className="text-muted-foreground text-xs">Your best friend for getting things done.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat input */}
        <div className="pb-2 pt-2 border-t border-border">
          <div className="flex gap-2 items-end bg-card rounded-2xl border border-border px-3 py-2 focus-within:border-primary/50 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Luna what's on your mind..."
              className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground min-h-[20px] max-h-24"
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Luna Suggestions Card */}
      {showSuggestions && (
        <div className="px-5 pb-3">
          <div className="bg-gradient-to-br from-primary/8 to-primary/4 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Moon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-primary">Luna suggests for today</span>
              </div>
              <button
                onClick={() => setSuggestionsDismissed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {suggestionsLoading ? (
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
                <span className="text-xs text-muted-foreground">Luna is thinking about your day...</span>
              </div>
            ) : suggestions ? (
              <>
                <p className="text-xs text-foreground/70 mb-3 leading-relaxed">{suggestions.message}</p>
                <div className="space-y-2">
                  {suggestions.suggestions.map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 py-2 px-3 rounded-xl transition-all",
                        addedSuggestions.has(i)
                          ? "bg-primary/10 opacity-60"
                          : "bg-card/80 hover:bg-card"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", addedSuggestions.has(i) && "line-through text-muted-foreground")}>
                          {s.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", categoryColors[s.category] || "bg-muted text-muted-foreground")}>
                          {s.category}
                        </span>
                        <button
                          onClick={() => addSuggestedTask(s, i)}
                          disabled={addedSuggestions.has(i)}
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                            addedSuggestions.has(i)
                              ? "bg-primary/20 text-primary"
                              : "bg-primary text-primary-foreground hover:scale-110 active:scale-95"
                          )}
                        >
                          {addedSuggestions.has(i)
                            ? <CheckCircle2 className="w-3.5 h-3.5" />
                            : <Plus className="w-3.5 h-3.5" />
                          }
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

      {/* Today's tasks */}
      <div className="px-5 py-4 border-t border-border bg-card/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-serif flex items-center gap-2">
            Today's Tasks
            {totalCount > 0 && (
              <span className="text-xs font-sans text-muted-foreground font-normal">
                {completedCount}/{totalCount}
              </span>
            )}
          </h2>
          <button
            onClick={() => setAddingTask(true)}
            className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {tasks.length === 0 && !addingTask && (
          <p className="text-xs text-muted-foreground text-center py-3">
            No tasks yet. Ask Luna to help you plan your day!
          </p>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto hide-scrollbar">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-2">
              <button
                onClick={() => toggleTask(task.id, task.completed)}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
              >
                {task.completed ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5" />}
              </button>
              <span className={cn("text-sm flex-1", task.completed ? "line-through text-muted-foreground" : "text-foreground")}>
                {task.title}
              </span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", categoryColors[task.category] || "bg-muted text-muted-foreground")}>
                {task.category}
              </span>
            </div>
          ))}
          {addingTask && (
            <div className="flex items-center gap-2 py-1">
              <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); } }}
                placeholder="New task..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground border-b border-primary/30 pb-1"
              />
              <button onClick={addTask} className="text-xs text-primary font-medium">Add</button>
              <button onClick={() => { setAddingTask(false); setNewTaskTitle(""); }} className="text-xs text-muted-foreground">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Daily Check-in Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <div className="relative bg-card w-full max-w-md rounded-t-3xl px-6 pt-6 pb-10 animate-in slide-in-from-bottom-4 duration-300">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-1.5">
                {WIZARD_STEPS.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      s.id === wizardStep ? "w-6 bg-primary" : s.id < wizardStep ? "w-3 bg-primary/40" : "w-3 bg-muted"
                    )}
                  />
                ))}
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Luna header in wizard */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <Moon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Luna · Morning check-in</span>
            </div>

            {/* Step emoji & heading */}
            <div className="mb-6">
              <div className="text-3xl mb-2">{currentWizardStep.emoji}</div>
              <h3 className="text-2xl font-serif leading-tight">{currentWizardStep.question}</h3>
              <p className="text-sm text-muted-foreground mt-1">{currentWizardStep.subtitle}</p>
            </div>

            {/* Step 1 — Sleep */}
            {wizardStep === 1 && (
              <div className="grid grid-cols-6 gap-2 mb-6">
                {[4, 5, 6, 7, 8, 9].map((h) => (
                  <button
                    key={h}
                    onClick={() => setWizardData((p) => ({ ...p, sleepHours: h }))}
                    className={cn(
                      "py-4 rounded-2xl text-sm font-semibold border-2 transition-all flex flex-col items-center gap-0.5",
                      wizardData.sleepHours === h
                        ? "bg-primary text-primary-foreground border-primary scale-105 shadow-md"
                        : "bg-accent border-transparent text-foreground hover:border-primary/30"
                    )}
                  >
                    <span className="text-base">{h}</span>
                    <span className="text-[10px] font-normal opacity-70">hrs</span>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2 — Energy */}
            {wizardStep === 2 && (
              <div className="mb-6">
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setWizardData((p) => ({ ...p, energyLevel: n }))}
                      className={cn(
                        "py-3.5 rounded-2xl text-sm font-semibold border-2 transition-all",
                        wizardData.energyLevel === n
                          ? "bg-primary text-primary-foreaming border-primary scale-105 shadow-md"
                          : "bg-accent border-transparent text-foreground hover:border-primary/30"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>Exhausted</span>
                  <span>Full power</span>
                </div>
              </div>
            )}

            {/* Step 3 — Mood */}
            {wizardStep === 3 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 mb-4">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setWizardData((p) => ({ ...p, mood: p.mood === m ? "" : m }))}
                      className={cn(
                        "px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all capitalize",
                        wizardData.mood === m
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-accent border-transparent text-foreground hover:border-primary/30"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  value={MOODS.includes(wizardData.mood as (typeof MOODS)[number]) ? "" : wizardData.mood}
                  onChange={(e) => setWizardData((p) => ({ ...p, mood: e.target.value }))}
                  placeholder="Or describe it in your own words..."
                  className="w-full px-4 py-3 rounded-2xl bg-accent border-2 border-transparent text-sm outline-none focus:border-primary/40 placeholder:text-muted-foreground"
                />
              </div>
            )}

            {/* Next / Save button */}
            <button
              onClick={handleWizardNext}
              disabled={createDailyContext.isPending}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-[0.98]"
            >
              {wizardStep < 3 ? (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              ) : createDailyContext.isPending ? (
                "Saving..."
              ) : (
                "Start my day ✨"
              )}
            </button>

            {/* Skip link */}
            <button
              onClick={() => setWizardOpen(false)}
              className="w-full text-center text-xs text-muted-foreground mt-3 py-1 hover:text-foreground transition-colors"
            >
              Skip for today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
