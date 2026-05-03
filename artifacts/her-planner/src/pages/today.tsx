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
  useGetTasksSummary,
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  getGetProfileQueryKey,
  getListTasksQueryKey,
  getGetTasksSummaryQueryKey,
  getGetTodayContextQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Send, Sparkles, CheckCircle2, Circle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string; streaming?: boolean };

const categoryColors: Record<string, string> = {
  work: "bg-blue-100 text-blue-700",
  home: "bg-amber-100 text-amber-700",
  health: "bg-green-100 text-green-700",
  kids: "bg-purple-100 text-purple-700",
  "self-care": "bg-pink-100 text-pink-700",
  food: "bg-orange-100 text-orange-700",
};

function getGreeting(name: string, phase?: string) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const phaseHints: Record<string, string> = {
    menstrual: "Take it gentle today — rest is productive too.",
    follicular: "Your energy is building. Let's make the most of it!",
    ovulation: "You're in your power. Big things today?",
    luteal: "Winding down beautifully. Let's keep it manageable.",
    unknown: "Let's make today count, together.",
  };
  return `${timeGreeting}, ${name}! ${phaseHints[phase ?? "unknown"]}`;
}

export default function TodayPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: profile, isLoading: profileLoading } = useGetProfile();
  const { data: todayCtx } = useGetTodayContext();
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
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinStep, setCheckinStep] = useState<"sleep" | "energy" | "mood" | null>(null);
  const [checkinData, setCheckinData] = useState({ sleepHours: 7, energyLevel: 7, mood: "" });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!profileLoading && !profile) {
      setLocation("/settings");
    }
  }, [profile, profileLoading, setLocation]);

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
            const greeting = getGreeting(profile.name, cyclePhase?.phase);
            setMessages([{ role: "assistant", content: greeting }]);
          },
        }
      );
    }
  }, [profile, conversations]);

  useEffect(() => {
    if (conversationId && messages.length === 0 && profile) {
      const greeting = getGreeting(profile.name, cyclePhase?.phase);
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [conversationId, profile, cyclePhase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const parseTasks = useCallback(
    (text: string) => {
      const match = text.match(/\[TASKS:(\{.*?\})\]/s);
      if (!match) return text;
      try {
        const parsed = JSON.parse(match[1]) as { tasks: Array<{ title: string; category: string; priority: string; view: string }> };
        parsed.tasks.forEach((t) => {
          createTask.mutate(
            {
              data: {
                title: t.title,
                category: t.category,
                priority: t.priority as "low" | "medium" | "high",
                view: (t.view as "today" | "week" | "month") || "today",
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
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.content) {
                fullText += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullText, streaming: true };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }

      const displayText = parseTasks(fullText);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: displayText, streaming: false };
        return updated;
      });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Sorry, I had trouble connecting. Try again?", streaming: false };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, conversationId, parseTasks, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleTask = (id: number, completed: boolean) => {
    updateTask.mutate(
      { id, data: { completed: !completed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ view: "today" }) });
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
      }
    );
  };

  const handleCheckin = (type: "sleep" | "energy" | "mood") => {
    setCheckinStep(type);
    setShowCheckin(true);
  };

  const saveCheckin = () => {
    const today = new Date().toISOString().split("T")[0];
    createDailyContext.mutate(
      {
        data: {
          date: today,
          sleepHours: checkinData.sleepHours,
          energyLevel: checkinData.energyLevel,
          mood: checkinData.mood || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowCheckin(false);
          setCheckinStep(null);
          queryClient.invalidateQueries({ queryKey: getGetTodayContextQueryKey() });
        },
      }
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-10 pb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
          {format(new Date(), "EEEE, MMMM do")}
        </p>
        <h1 className="text-2xl font-serif text-foreground leading-snug">
          {profile ? `${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, ${profile.name}` : "Welcome"}
        </h1>
        {cyclePhase && cyclePhase.phase !== "unknown" && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {cyclePhase.phase.charAt(0).toUpperCase() + cyclePhase.phase.slice(1)} phase · Day {cyclePhase.dayInCycle}
          </div>
        )}
      </header>

      {/* Quick check-in row */}
      <div className="px-5 flex gap-2 mb-4">
        <button
          onClick={() => handleCheckin("sleep")}
          data-testid="btn-checkin-sleep"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
            todayCtx?.sleepHours ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          🌙 {todayCtx?.sleepHours ? `${todayCtx.sleepHours}h sleep` : "Log sleep"}
        </button>
        <button
          onClick={() => handleCheckin("energy")}
          data-testid="btn-checkin-energy"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
            todayCtx?.energyLevel ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          ⚡ {todayCtx?.energyLevel ? `Energy ${todayCtx.energyLevel}/10` : "Log energy"}
        </button>
        <button
          onClick={() => handleCheckin("mood")}
          data-testid="btn-checkin-mood"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
            todayCtx?.mood ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          🌸 {todayCtx?.mood || "Log mood"}
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden px-5">
        <div className="flex-1 overflow-y-auto space-y-3 pb-3 hide-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="w-4 h-4 text-primary" />
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
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">Aria is here for you. Say hello!</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat input */}
        <div className="pb-2 pt-2 border-t border-border">
          <div className="flex gap-2 items-end bg-card rounded-2xl border border-border px-3 py-2 focus-within:border-primary/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Aria what's on your mind..."
              data-testid="input-chat"
              className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground min-h-[20px] max-h-24"
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              data-testid="btn-send"
              className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

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
            data-testid="btn-add-task"
            className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {tasks.length === 0 && !addingTask && (
          <p className="text-xs text-muted-foreground text-center py-3">
            No tasks yet. Ask Aria to help plan your day!
          </p>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto hide-scrollbar">
          {tasks.map((task) => (
            <div
              key={task.id}
              data-testid={`task-item-${task.id}`}
              className="flex items-center gap-3 py-2 group"
            >
              <button
                onClick={() => toggleTask(task.id, task.completed)}
                data-testid={`btn-complete-task-${task.id}`}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
              >
                {task.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </button>
              <span
                className={cn(
                  "text-sm flex-1 transition-all",
                  task.completed ? "line-through text-muted-foreground" : "text-foreground"
                )}
              >
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
                data-testid="input-new-task"
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground border-b border-primary/30 pb-1"
              />
              <button onClick={addTask} className="text-xs text-primary font-medium">Add</button>
              <button onClick={() => { setAddingTask(false); setNewTaskTitle(""); }} className="text-xs text-muted-foreground">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Check-in modal */}
      {showCheckin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCheckin(false)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            {checkinStep === "sleep" && (
              <>
                <h3 className="text-xl font-serif mb-1">How did you sleep?</h3>
                <p className="text-sm text-muted-foreground mb-5">Hours of sleep last night</p>
                <div className="flex items-center gap-4 mb-6">
                  {[4, 5, 6, 7, 8, 9].map((h) => (
                    <button
                      key={h}
                      onClick={() => setCheckinData((p) => ({ ...p, sleepHours: h }))}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-sm font-medium border transition-all",
                        checkinData.sleepHours === h ? "bg-primary text-primary-foreground border-primary" : "bg-accent border-border text-foreground"
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </>
            )}
            {checkinStep === "energy" && (
              <>
                <h3 className="text-xl font-serif mb-1">Energy level?</h3>
                <p className="text-sm text-muted-foreground mb-5">How are you feeling right now?</p>
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCheckinData((p) => ({ ...p, energyLevel: n }))}
                      className={cn(
                        "py-3 rounded-xl text-sm font-medium border transition-all",
                        checkinData.energyLevel === n ? "bg-primary text-primary-foreground border-primary" : "bg-accent border-border text-foreground"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}
            {checkinStep === "mood" && (
              <>
                <h3 className="text-xl font-serif mb-1">How are you feeling?</h3>
                <p className="text-sm text-muted-foreground mb-5">Pick one or type your own</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {["happy", "calm", "tired", "anxious", "motivated", "overwhelmed", "grateful", "sad"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setCheckinData((p) => ({ ...p, mood: m }))}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium border transition-all capitalize",
                        checkinData.mood === m ? "bg-primary text-primary-foreground border-primary" : "bg-accent border-border text-foreground"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  value={checkinData.mood}
                  onChange={(e) => setCheckinData((p) => ({ ...p, mood: e.target.value }))}
                  placeholder="Or type how you feel..."
                  className="w-full px-4 py-2 rounded-xl bg-accent border border-border text-sm outline-none focus:border-primary/50"
                />
              </>
            )}
            <button
              onClick={saveCheckin}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm mt-2"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
