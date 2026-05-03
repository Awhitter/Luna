import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Task,
  TasksSummary,
  useCreateDailyContext,
  useCreateOpenaiConversation,
  useCreateTask,
  useDeleteTask,
  useGetCurrentCyclePhase,
  useGetProfile,
  useGetTasksSummary,
  useGetTodayContext,
  useListTasks,
  useUpdateTask,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RingChart } from "@/components/RingChart";
import { useColors } from "@/hooks/useColors";

interface SuggestedTask {
  title: string;
  category: string;
  priority: string;
  view: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  suggestedTasks?: SuggestedTask[];
}

let msgCounter = 0;
function uid(): string {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

let convInitLock = false;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PHASE_EMOJI: Record<string, string> = {
  menstrual: "🌑", follicular: "🌒", ovulation: "🌕", luteal: "🌖", unknown: "🌙",
};
const PHASE_LABEL: Record<string, string> = {
  menstrual: "Menstrual", follicular: "Follicular", ovulation: "Ovulation", luteal: "Luteal", unknown: "Cycle",
};

const MOOD_LABELS = ["", "Awful", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["", "None", "Low", "Medium", "High", "Full"];
const SLEEP_OPTIONS = [5, 6, 7, 8, 9];

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function parseTasks(content: string): { displayText: string; tasks: SuggestedTask[] } {
  const taskRegex = /\[TASKS:(\{.*?\})\]/s;
  const match = content.match(taskRegex);
  if (!match?.[1]) return { displayText: content, tasks: [] };
  try {
    const parsed = JSON.parse(match[1]) as { tasks?: SuggestedTask[] };
    return {
      displayText: content.replace(taskRegex, "").trim(),
      tasks: parsed.tasks ?? [],
    };
  } catch {
    return { displayText: content.replace(taskRegex, "").trim(), tasks: [] };
  }
}

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set());

  const [checkinMood, setCheckinMood] = useState(0);
  const [checkinEnergy, setCheckinEnergy] = useState(0);
  const [checkinSleep, setCheckinSleep] = useState(7);
  const [checkinExpanded, setCheckinExpanded] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const initialized = useRef(false);

  const createConversation = useCreateOpenaiConversation();
  const createDailyContext = useCreateDailyContext();
  const { data: profile } = useGetProfile();
  const { data: todayCtx, refetch: refetchCtx } = useGetTodayContext();
  const { data: summary } = useGetTasksSummary();
  const { data: phase } = useGetCurrentCyclePhase();
  const { data: tasks, refetch: refetchTasks } = useListTasks({});
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();

  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const checkinNeeded = !todayCtx;
  const firstName = profile?.name?.split(" ")[0] ?? "";

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initConversation();
  }, []);

  async function initConversation() {
    if (convInitLock) return;
    convInitLock = true;
    try {
      const storedId = await AsyncStorage.getItem("luna-conversation-id");
      if (storedId) {
        setConversationId(parseInt(storedId, 10));
      } else {
        const conv = await createConversation.mutateAsync({ data: { title: "Luna Chat" } });
        setConversationId(conv.id);
        await AsyncStorage.setItem("luna-conversation-id", String(conv.id));
      }
    } catch {
      convInitLock = false;
    }
  }

  async function handleWizardSave() {
    if (checkinMood === 0 || checkinEnergy === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await createDailyContext.mutateAsync({
        data: {
          date: today,
          sleepHours: checkinSleep,
          energyLevel: checkinEnergy,
          mood: MOOD_LABELS[checkinMood] ?? undefined,
        },
      });
      refetchCtx();
      setCheckinExpanded(false);
    } catch {}
  }

  function handlePromptTap(promptText: string) {
    sendMessage(promptText);
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isStreaming || !conversationId) return;
    setInputText("");
    await sendMessage(text);
  }

  async function sendMessage(text: string) {
    if (!text || isStreaming || !conversationId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: Message = { id: uid(), role: "user", content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setShowTyping(true);

    let fullContent = "";
    let assistantId = uid();
    let assistantAdded = false;

    try {
      const response = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/openai/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ content: text }),
        }
      );
      if (!response.ok) throw new Error("Request failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { content?: string };
            if (parsed.content) {
              fullContent += parsed.content;
              if (!assistantAdded) {
                setShowTyping(false);
                const { displayText, tasks: st } = parseTasks(fullContent);
                setMessages((prev) => [
                  ...prev,
                  { id: assistantId, role: "assistant", content: displayText, ts: Date.now(), suggestedTasks: st },
                ]);
                assistantAdded = true;
              } else {
                const { displayText, tasks: st } = parseTasks(fullContent);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.id === assistantId) {
                    updated[updated.length - 1] = { ...last, content: displayText, suggestedTasks: st };
                  }
                  return updated;
                });
              }
            }
          } catch {}
        }
      }
    } catch {
      setShowTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: "Sorry, something went wrong. Try again?", ts: Date.now() },
      ]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }

    setTimeout(() => inputRef.current?.focus(), 80);
  }

  async function handleAddSuggestedTask(msgId: string, task: SuggestedTask) {
    const key = `${msgId}-${task.title}`;
    if (addedTasks.has(key)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createTask.mutateAsync({
        data: {
          title: task.title,
          category: task.category as Task["category"],
          priority: task.priority as Task["priority"],
          view: task.view as Task["view"],
        },
      });
      setAddedTasks((prev) => new Set([...prev, key]));
      refetchTasks();
    } catch {}
  }

  async function toggleTask(id: number, completed: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateTask.mutateAsync({ id, data: { completed: !completed } });
      refetchTasks();
    } catch {}
  }

  async function removeTask(id: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await deleteTask.mutateAsync({ id });
      refetchTasks();
    } catch {}
  }

  async function addTask() {
    const title = newTaskText.trim();
    if (!title) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNewTaskText("");
    try {
      await createTask.mutateAsync({ data: { title, category: "personal", priority: "medium", view: "today" } });
      refetchTasks();
    } catch {}
  }

  const phaseKey = phase?.phase ?? "unknown";
  const reversed = [...messages].reverse();

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ─── Compact Header ─── */}
      <View style={[s.header, { paddingTop: topPad + 10, backgroundColor: colors.background, borderBottomColor: colors.border }]}>

        {/* Welcome row */}
        <View style={s.welcomeRow}>
          <View style={{ flex: 1 }}>
            {firstName ? (
              <>
                <Text style={[s.welcomeLine, { color: colors.mutedForeground }]}>
                  {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}
                </Text>
                <Text style={[s.welcomeName, { color: colors.foreground }]}>
                  Welcome back, {firstName} 👋
                </Text>
              </>
            ) : (
              <Text style={[s.welcomeName, { color: colors.foreground }]}>Her Planner</Text>
            )}
          </View>
          <Pressable
            onPress={() => setShowTasks(true)}
            style={[s.tasksBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.tasksBtnText, { color: colors.primaryForeground }]}>Tasks</Text>
          </Pressable>
        </View>

        {/* Compact rings + phase info in one row */}
        <View style={[s.statsRow, { borderTopColor: colors.border }]}>
          <View style={s.miniRingGroup}>
            <RingChart
              completed={summary?.today?.completed ?? 0}
              total={summary?.today?.total ?? 0}
              size={56}
              strokeWidth={5}
              color={colors.primary}
              bgColor={colors.muted}
              label="Today"
              labelColor={colors.foreground}
              mutedColor={colors.mutedForeground}
            />
            <RingChart
              completed={summary?.week?.completed ?? 0}
              total={summary?.week?.total ?? 0}
              size={56}
              strokeWidth={5}
              color="#9b7fc4"
              bgColor={colors.muted}
              label="Week"
              labelColor={colors.foreground}
              mutedColor={colors.mutedForeground}
            />
            <RingChart
              completed={summary?.month?.completed ?? 0}
              total={summary?.month?.total ?? 0}
              size={56}
              strokeWidth={5}
              color="#d4a843"
              bgColor={colors.muted}
              label="Month"
              labelColor={colors.foreground}
              mutedColor={colors.mutedForeground}
            />
          </View>

          <View style={[s.divV, { backgroundColor: colors.border }]} />

          {/* Phase + context info stack */}
          <View style={s.contextStack}>
            <View style={[s.phasePill, { backgroundColor: colors.accent }]}>
              <Text style={s.pillEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
              <Text style={[s.pillText, { color: colors.foreground }]}>
                {PHASE_LABEL[phaseKey]}
                {phase?.dayInCycle != null ? ` · D${phase.dayInCycle}` : ""}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 5 }}>
              <View style={s.ctxChips}>
                {todayCtx?.energyLevel != null && (
                  <View style={[s.ctxChip, { backgroundColor: colors.muted }]}>
                    <Text style={[s.ctxChipTxt, { color: colors.mutedForeground }]}>⚡ {todayCtx.energyLevel}/5</Text>
                  </View>
                )}
                {todayCtx?.sleepHours != null && (
                  <View style={[s.ctxChip, { backgroundColor: colors.muted }]}>
                    <Text style={[s.ctxChipTxt, { color: colors.mutedForeground }]}>😴 {todayCtx.sleepHours}h</Text>
                  </View>
                )}
                {phase?.nextPeriodIn != null && (
                  <View style={[s.ctxChip, { backgroundColor: colors.muted }]}>
                    <Text style={[s.ctxChipTxt, { color: colors.mutedForeground }]}>📅 {phase.nextPeriodIn}d</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Inline check-in */}
        {checkinNeeded && (
          <View style={[s.checkinBanner, { borderTopColor: colors.border }]}>
            {!checkinExpanded ? (
              <Pressable
                style={s.checkinBannerInner}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCheckinExpanded(true); }}
              >
                <Text style={[s.checkinBannerText, { color: colors.mutedForeground }]}>
                  ☀️  Morning check-in — how are you today?
                </Text>
                <View style={[s.checkinBannerBtn, { backgroundColor: colors.primary }]}>
                  <Text style={[s.checkinBannerBtnTxt, { color: colors.primaryForeground }]}>Start</Text>
                </View>
              </Pressable>
            ) : (
              <CheckinExpanded
                mood={checkinMood}
                energy={checkinEnergy}
                sleep={checkinSleep}
                onMood={setCheckinMood}
                onEnergy={setCheckinEnergy}
                onSleep={setCheckinSleep}
                onSave={handleWizardSave}
                onClose={() => setCheckinExpanded(false)}
                isPending={createDailyContext.isPending}
                colors={colors}
              />
            )}
          </View>
        )}
      </View>

      {/* ─── Chat ─── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              colors={colors}
              addedTasks={addedTasks}
              onAddTask={handleAddSuggestedTask}
            />
          )}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator colors={colors} /> : null}
          ListEmptyComponent={<EmptyState colors={colors} name={firstName} onPrompt={handlePromptTap} />}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={messages.length === 0 ? s.emptyContainer : s.msgList}
          showsVerticalScrollIndicator={false}
        />

        {/* Input area */}
        <View style={[s.inputArea, { paddingBottom: bottomPad + 6, borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>Plan your day with Luna</Text>
          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              style={[s.inputField, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ask anything…"
              placeholderTextColor={colors.mutedForeground}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              multiline
              maxLength={1200}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => { handleSend(); inputRef.current?.focus(); }}
              style={[s.sendBtn, { backgroundColor: inputText.trim() && !isStreaming ? colors.primary : colors.muted }]}
              disabled={!inputText.trim() || isStreaming}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Text style={[s.sendIcon, { color: inputText.trim() ? colors.primaryForeground : colors.mutedForeground }]}>↑</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ─── Tasks Modal ─── */}
      <Modal
        visible={showTasks}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTasks(false)}
      >
        <TasksSheet
          tasks={tasks ?? []}
          newTaskText={newTaskText}
          onNewTaskText={setNewTaskText}
          onAddTask={addTask}
          onToggle={toggleTask}
          onDelete={removeTask}
          onClose={() => setShowTasks(false)}
          colors={colors}
          insets={insets}
          isWeb={isWeb}
          summary={summary}
        />
      </Modal>
    </View>
  );
}

// ─── CheckinExpanded ─────────────────────────────────────────────────────────

function CheckinExpanded({
  mood, energy, sleep,
  onMood, onEnergy, onSleep,
  onSave, onClose, isPending, colors,
}: {
  mood: number; energy: number; sleep: number;
  onMood: (v: number) => void; onEnergy: (v: number) => void; onSleep: (v: number) => void;
  onSave: () => void; onClose: () => void; isPending: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={ce.container}>
      <View style={ce.titleRow}>
        <Text style={[ce.title, { color: colors.foreground }]}>How are you today?</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[ce.close, { color: colors.mutedForeground }]}>✕</Text>
        </Pressable>
      </View>

      <View style={ce.row}>
        <Text style={[ce.rowLabel, { color: colors.mutedForeground }]}>Mood</Text>
        <View style={ce.btns}>
          {[1,2,3,4,5].map((v) => (
            <Pressable
              key={v}
              onPress={() => { Haptics.selectionAsync(); onMood(v); }}
              style={[ce.btn, { backgroundColor: mood === v ? colors.primary : colors.muted }]}
            >
              <Text style={[ce.btnNum, { color: mood === v ? colors.primaryForeground : colors.foreground }]}>{v}</Text>
              <Text style={[ce.btnLbl, { color: mood === v ? colors.primaryForeground : colors.mutedForeground }]}>
                {MOOD_LABELS[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={ce.row}>
        <Text style={[ce.rowLabel, { color: colors.mutedForeground }]}>Energy</Text>
        <View style={ce.btns}>
          {[1,2,3,4,5].map((v) => (
            <Pressable
              key={v}
              onPress={() => { Haptics.selectionAsync(); onEnergy(v); }}
              style={[ce.btn, { backgroundColor: energy === v ? "#9b7fc4" : colors.muted }]}
            >
              <Text style={[ce.btnNum, { color: energy === v ? "#fff" : colors.foreground }]}>{v}</Text>
              <Text style={[ce.btnLbl, { color: energy === v ? "#fff" : colors.mutedForeground }]}>
                {ENERGY_LABELS[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={ce.row}>
        <Text style={[ce.rowLabel, { color: colors.mutedForeground }]}>Sleep</Text>
        <View style={ce.btns}>
          {SLEEP_OPTIONS.map((h) => (
            <Pressable
              key={h}
              onPress={() => { Haptics.selectionAsync(); onSleep(h); }}
              style={[ce.btn, { backgroundColor: sleep === h ? "#d4a843" : colors.muted }]}
            >
              <Text style={[ce.btnNum, { color: sleep === h ? "#fff" : colors.foreground }]}>{h}h</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={ce.saveRow}>
        <Pressable onPress={onClose} style={[ce.skipBtn, { borderColor: colors.border }]}>
          <Text style={[ce.skipTxt, { color: colors.mutedForeground }]}>Later</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={mood === 0 || energy === 0 || isPending}
          style={[ce.saveBtn, { backgroundColor: colors.primary, opacity: (mood === 0 || energy === 0) ? 0.4 : 1 }]}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[ce.saveTxt, { color: colors.primaryForeground }]}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message, colors, addedTasks, onAddTask,
}: {
  message: Message;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  addedTasks: Set<string>;
  onAddTask: (msgId: string, task: SuggestedTask) => void;
}) {
  const isUser = message.role === "user";
  return (
    <View style={[mb.row, isUser ? mb.userRow : mb.assistantRow]}>
      {!isUser && (
        <View style={[mb.avatar, { backgroundColor: colors.primary }]}>
          <Text style={mb.avatarGlyph}>☽</Text>
        </View>
      )}
      <View style={{ maxWidth: "82%", gap: 6 }}>
        <View style={[mb.bubble, isUser
          ? [mb.userBubble, { backgroundColor: colors.primary }]
          : [mb.assistantBubble, { backgroundColor: colors.card }]
        ]}>
          <Text style={[mb.text, { color: isUser ? colors.primaryForeground : colors.foreground }]}>
            {message.content}
          </Text>
          <Text style={[mb.time, { color: isUser ? `${colors.primaryForeground}88` : colors.mutedForeground }]}>
            {formatTime(message.ts)}
          </Text>
        </View>

        {/* Task suggestion pills */}
        {!isUser && message.suggestedTasks && message.suggestedTasks.length > 0 && (
          <View style={mb.suggestionsWrap}>
            <Text style={[mb.suggestionsLabel, { color: colors.mutedForeground }]}>
              Suggested tasks — tap to add:
            </Text>
            <View style={mb.suggestionsList}>
              {message.suggestedTasks.map((task, i) => {
                const key = `${message.id}-${task.title}`;
                const added = addedTasks.has(key);
                return (
                  <Pressable
                    key={i}
                    onPress={() => onAddTask(message.id, task)}
                    style={[
                      mb.suggestionPill,
                      added
                        ? { backgroundColor: "#70b07022", borderColor: "#70b070" }
                        : { backgroundColor: colors.accent, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[mb.suggestionPillText, { color: added ? "#3a7a3a" : colors.foreground }]}>
                      {added ? "✓ " : "+ "}{task.title}
                    </Text>
                    {!added && (
                      <View style={[mb.viewTag, { backgroundColor: colors.muted }]}>
                        <Text style={[mb.viewTagText, { color: colors.mutedForeground }]}>{task.view}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

function TypingIndicator({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={[mb.avatar, { backgroundColor: colors.primary }]}>
        <Text style={mb.avatarGlyph}>☽</Text>
      </View>
      <View style={[mb.bubble, mb.assistantBubble, { backgroundColor: colors.card }]}>
        <Text style={[mb.text, { color: colors.mutedForeground }]}>Luna is thinking…</Text>
      </View>
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

const PROMPTS = [
  "What should I prioritize today?",
  "Plan tasks for my energy level",
  "Help me with meals this week",
  "I'm feeling overwhelmed",
];

function EmptyState({
  colors,
  name,
  onPrompt,
}: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  name: string;
  onPrompt: (text: string) => void;
}) {
  return (
    <View style={es.container}>
      <View style={[es.avatar, { backgroundColor: colors.primary }]}>
        <Text style={es.avatarGlyph}>☽</Text>
      </View>
      <Text style={[es.heading, { color: colors.foreground }]}>
        {name ? `Hi ${name}, I'm Luna` : "Hi, I'm Luna"}
      </Text>
      <Text style={[es.sub, { color: colors.mutedForeground }]}>
        Your AI planner. I know your cycle, energy, and daily life — tell me what's on your mind.
      </Text>
      <View style={es.grid}>
        {PROMPTS.map((p, i) => (
          <Pressable
            key={i}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPrompt(p);
            }}
            style={({ pressed }) => [
              es.prompt,
              {
                backgroundColor: pressed ? colors.primary : colors.card,
                borderColor: pressed ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[es.promptText, { color: colors.foreground }]}>{p}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── TasksSheet ───────────────────────────────────────────────────────────────

function TasksSheet({
  tasks, newTaskText, onNewTaskText, onAddTask, onToggle, onDelete, onClose, colors, insets, isWeb, summary,
}: {
  tasks: Task[];
  newTaskText: string;
  onNewTaskText: (v: string) => void;
  onAddTask: () => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number; bottom: number };
  isWeb: boolean;
  summary: TasksSummary | undefined;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <View style={[ts.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }]}>
      <View style={[ts.topRow]}>
        <Text style={[ts.heading, { color: colors.foreground }]}>Tasks</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[ts.done, { color: colors.primary }]}>Done</Text>
        </Pressable>
      </View>

      {summary && (
        <View style={ts.ringsRow}>
          <RingChart completed={summary.today?.completed ?? 0} total={summary.today?.total ?? 0} size={68} strokeWidth={5} color={colors.primary} bgColor={colors.muted} label="Today" labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <RingChart completed={summary.week?.completed ?? 0} total={summary.week?.total ?? 0} size={68} strokeWidth={5} color="#9b7fc4" bgColor={colors.muted} label="Week" labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <RingChart completed={summary.month?.completed ?? 0} total={summary.month?.total ?? 0} size={68} strokeWidth={5} color="#d4a843" bgColor={colors.muted} label="Month" labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
        </View>
      )}

      <View style={[ts.addRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[ts.addInput, { color: colors.foreground }]}
          placeholder="Add a task…"
          placeholderTextColor={colors.mutedForeground}
          value={newTaskText}
          onChangeText={onNewTaskText}
          onSubmitEditing={onAddTask}
          returnKeyType="done"
        />
        <Pressable onPress={onAddTask} style={[ts.addBtn, { backgroundColor: colors.primary }]}>
          <Text style={[ts.addBtnText, { color: colors.primaryForeground }]}>+</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={ts.list}>
        {pending.length === 0 && done.length === 0 && (
          <Text style={[ts.empty, { color: colors.mutedForeground }]}>No tasks yet. Add one above.</Text>
        )}
        {pending.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} colors={colors} />)}
        {done.length > 0 && (
          <>
            <Text style={[ts.sectionLabel, { color: colors.mutedForeground }]}>Completed</Text>
            {done.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} colors={colors} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TaskRow({
  task, onToggle, onDelete, colors,
}: {
  task: Task;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={[tr.row, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => onToggle(task.id, task.completed ?? false)}>
        <View style={[tr.circle, { borderColor: task.completed ? colors.primary : colors.border, backgroundColor: task.completed ? colors.primary : "transparent" }]}>
          {task.completed && <Text style={tr.tick}>✓</Text>}
        </View>
      </Pressable>
      <Text style={[tr.title, { color: task.completed ? colors.mutedForeground : colors.foreground, textDecorationLine: task.completed ? "line-through" : "none" }]} numberOfLines={2}>
        {task.title}
      </Text>
      {task.category && (
        <View style={[tr.cat, { backgroundColor: colors.muted }]}>
          <Text style={[tr.catText, { color: colors.mutedForeground }]}>{task.category}</Text>
        </View>
      )}
      <Pressable onPress={() => onDelete(task.id)} hitSlop={8}>
        <Text style={[tr.del, { color: colors.mutedForeground }]}>✕</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingBottom: 0 },
  welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 10 },
  welcomeLine: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular" },
  welcomeName: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", marginTop: 1 },
  tasksBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
  tasksBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  statsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, gap: 12 },
  miniRingGroup: { flexDirection: "row", gap: 14, alignItems: "center" },
  divV: { width: 1, height: 50, flexShrink: 0 },
  contextStack: { flex: 1 },
  phasePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, alignSelf: "flex-start" },
  pillEmoji: { fontSize: 12 },
  pillText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  ctxChips: { flexDirection: "row", gap: 6 },
  ctxChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  ctxChipTxt: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  checkinBanner: { borderTopWidth: 1 },
  checkinBannerInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 9, gap: 10 },
  checkinBannerText: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" },
  checkinBannerBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100 },
  checkinBannerBtnTxt: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  emptyContainer: { flex: 1 },
  msgList: { paddingHorizontal: 14, paddingVertical: 8 },
  inputArea: { borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 14 },
  inputLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingBottom: 2 },
  inputField: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", maxHeight: 110 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center", marginBottom: 1 },
  sendIcon: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
});

const ce = StyleSheet.create({
  container: { padding: 14, gap: 10 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  close: { fontSize: 16 },
  row: { gap: 6 },
  rowLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  btns: { flexDirection: "row", gap: 6 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", gap: 2 },
  btnNum: { fontSize: 14, fontFamily: "PlusJakartaSans_700Bold" },
  btnLbl: { fontSize: 8, fontFamily: "PlusJakartaSans_400Regular" },
  saveRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  skipBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  skipTxt: { fontSize: 13, fontFamily: "PlusJakartaSans_500Medium" },
  saveBtn: { flex: 2, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  saveTxt: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
});

const mb = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 3, gap: 8 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start", paddingRight: 40 },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 6 },
  avatarGlyph: { fontSize: 13 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, gap: 4 },
  userBubble: { borderBottomRightRadius: 5 },
  assistantBubble: { borderBottomLeftRadius: 5 },
  text: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 22 },
  time: { fontSize: 10, fontFamily: "PlusJakartaSans_400Regular", alignSelf: "flex-end" },
  suggestionsWrap: { gap: 5, paddingLeft: 4 },
  suggestionsLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_500Medium" },
  suggestionsList: { gap: 5 },
  suggestionPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  suggestionPillText: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_500Medium" },
  viewTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100 },
  viewTagText: { fontSize: 10, fontFamily: "PlusJakartaSans_500Medium" },
});

const es = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 12 },
  avatar: { width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center" },
  avatarGlyph: { fontSize: 26 },
  heading: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", textAlign: "center" },
  sub: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 },
  prompt: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
  promptText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" },
});

const ts = StyleSheet.create({
  container: { flex: 1 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingHorizontal: 20 },
  heading: { fontSize: 24, fontFamily: "PlusJakartaSans_700Bold" },
  done: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  ringsRow: { flexDirection: "row", justifyContent: "space-evenly", marginBottom: 20 },
  addRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingLeft: 14, marginBottom: 16, overflow: "hidden", marginHorizontal: 20 },
  addInput: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", paddingVertical: 12 },
  addBtn: { width: 46, height: 46, justifyContent: "center", alignItems: "center" },
  addBtnText: { fontSize: 22 },
  list: { paddingBottom: 24, paddingHorizontal: 20 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
});

const tr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  tick: { fontSize: 11, color: "#fff" },
  title: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 20 },
  cat: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  catText: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  del: { fontSize: 14, flexShrink: 0 },
});
