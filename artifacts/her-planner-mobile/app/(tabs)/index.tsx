import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useCreateDailyContext,
  useCreateOpenaiConversation,
  useCreateTask,
  useDeleteTask,
  useGetCurrentCyclePhase,
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
  Animated,
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

let msgCounter = 0;
function uid(): string {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

let convInitLock = false;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PHASE_EMOJI: Record<string, string> = {
  menstrual: "🌑",
  follicular: "🌒",
  ovulation: "🌕",
  luteal: "🌖",
  unknown: "🌙",
};

const PHASE_LABEL: Record<string, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
  unknown: "Cycle",
};

const MOOD_LABELS = ["", "Awful", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["", "None", "Low", "Medium", "High", "Full"];
const SLEEP_OPTIONS = [5, 6, 7, 8, 9];

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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

  const [checkinMood, setCheckinMood] = useState(0);
  const [checkinEnergy, setCheckinEnergy] = useState(0);
  const [checkinSleep, setCheckinSleep] = useState(7);
  const [checkinExpanded, setCheckinExpanded] = useState(false);

  const [newTaskText, setNewTaskText] = useState("");
  const initialized = useRef(false);
  const typingAnim = useRef(new Animated.Value(0)).current;

  const createConversation = useCreateOpenaiConversation();
  const createDailyContext = useCreateDailyContext();
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

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initConversation();
  }, []);

  useEffect(() => {
    if (showTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(typingAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      typingAnim.stopAnimation();
      typingAnim.setValue(0);
    }
  }, [showTyping]);

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

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isStreaming || !conversationId) return;
    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: Message = { id: uid(), role: "user", content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setShowTyping(true);

    let fullContent = "";
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
                setMessages((prev) => [
                  ...prev,
                  { id: uid(), role: "assistant", content: fullContent, ts: Date.now() },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
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

  const reversed = [...messages].reverse();
  const phaseKey = phase?.phase ?? "unknown";

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ─── Header ─── */}
      <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={s.headerTopRow}>
          <View>
            <Text style={[s.headerDay, { color: colors.mutedForeground }]}>
              {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}
            </Text>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Luna</Text>
          </View>
          <View style={s.headerRight}>
            <Pressable
              onPress={() => setShowTasks(true)}
              style={[s.pillBtn, { backgroundColor: colors.muted }]}
            >
              <Text style={[s.pillBtnText, { color: colors.foreground }]}>Tasks</Text>
            </Pressable>
          </View>
        </View>

        {/* Phase + context chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          <View style={[s.chip, { backgroundColor: colors.accent }]}>
            <Text style={s.chipEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
            <Text style={[s.chipText, { color: colors.foreground }]}>
              {PHASE_LABEL[phaseKey]}
              {phase?.dayInCycle != null ? ` · Day ${phase.dayInCycle}` : ""}
            </Text>
          </View>
          {todayCtx?.energyLevel != null && (
            <View style={[s.chip, { backgroundColor: colors.accent }]}>
              <Text style={s.chipEmoji}>⚡</Text>
              <Text style={[s.chipText, { color: colors.foreground }]}>Energy {todayCtx.energyLevel}/5</Text>
            </View>
          )}
          {todayCtx?.sleepHours != null && (
            <View style={[s.chip, { backgroundColor: colors.accent }]}>
              <Text style={s.chipEmoji}>😴</Text>
              <Text style={[s.chipText, { color: colors.foreground }]}>{todayCtx.sleepHours}h sleep</Text>
            </View>
          )}
          {todayCtx?.mood && (
            <View style={[s.chip, { backgroundColor: colors.accent }]}>
              <Text style={s.chipEmoji}>✨</Text>
              <Text style={[s.chipText, { color: colors.foreground }]}>{todayCtx.mood}</Text>
            </View>
          )}
          {phase?.nextPeriodIn != null && (
            <View style={[s.chip, { backgroundColor: colors.accent }]}>
              <Text style={s.chipEmoji}>📅</Text>
              <Text style={[s.chipText, { color: colors.foreground }]}>Period in {phase.nextPeriodIn}d</Text>
            </View>
          )}
        </ScrollView>

        {/* Ring charts */}
        <View style={[s.ringsRow, { borderTopColor: colors.border }]}>
          <RingChart
            completed={summary?.today?.completed ?? 0}
            total={summary?.today?.total ?? 0}
            size={72}
            strokeWidth={6}
            color={colors.primary}
            bgColor={colors.muted}
            label="Today"
            labelColor={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
          <View style={[s.ringDivider, { backgroundColor: colors.border }]} />
          <RingChart
            completed={summary?.week?.completed ?? 0}
            total={summary?.week?.total ?? 0}
            size={72}
            strokeWidth={6}
            color="#9b7fc4"
            bgColor={colors.muted}
            label="Week"
            labelColor={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
          <View style={[s.ringDivider, { backgroundColor: colors.border }]} />
          <RingChart
            completed={summary?.month?.completed ?? 0}
            total={summary?.month?.total ?? 0}
            size={72}
            strokeWidth={6}
            color="#d4a843"
            bgColor={colors.muted}
            label="Month"
            labelColor={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
        </View>
      </View>

      {/* ─── Inline Check-in (if not done today) ─── */}
      {checkinNeeded && (
        <View style={[s.checkinCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!checkinExpanded ? (
            <Pressable
              style={s.checkinCollapsed}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCheckinExpanded(true); }}
            >
              <Text style={s.checkinIcon}>☀️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.checkinTitle, { color: colors.foreground }]}>Morning check-in</Text>
                <Text style={[s.checkinSub, { color: colors.mutedForeground }]}>Log your mood, energy & sleep</Text>
              </View>
              <View style={[s.checkinArrow, { backgroundColor: colors.primary }]}>
                <Text style={[s.checkinArrowText, { color: colors.primaryForeground }]}>Start</Text>
              </View>
            </Pressable>
          ) : (
            <View style={s.checkinExpanded}>
              <View style={s.checkinExpandedHeader}>
                <Text style={[s.checkinTitle, { color: colors.foreground }]}>How are you today?</Text>
                <Pressable onPress={() => setCheckinExpanded(false)} hitSlop={12}>
                  <Text style={[s.checkinClose, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              </View>

              <Text style={[s.checkinLabel, { color: colors.mutedForeground }]}>Mood</Text>
              <View style={s.ratingRow}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => { Haptics.selectionAsync(); setCheckinMood(v); }}
                    style={[s.ratingBtn, { backgroundColor: checkinMood === v ? colors.primary : colors.muted, borderColor: checkinMood === v ? colors.primary : "transparent" }]}
                  >
                    <Text style={[s.ratingNum, { color: checkinMood === v ? colors.primaryForeground : colors.foreground }]}>{v}</Text>
                    <Text style={[s.ratingLbl, { color: checkinMood === v ? colors.primaryForeground : colors.mutedForeground }]}>{MOOD_LABELS[v]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[s.checkinLabel, { color: colors.mutedForeground }]}>Energy</Text>
              <View style={s.ratingRow}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => { Haptics.selectionAsync(); setCheckinEnergy(v); }}
                    style={[s.ratingBtn, { backgroundColor: checkinEnergy === v ? "#9b7fc4" : colors.muted, borderColor: checkinEnergy === v ? "#9b7fc4" : "transparent" }]}
                  >
                    <Text style={[s.ratingNum, { color: checkinEnergy === v ? "#fff" : colors.foreground }]}>{v}</Text>
                    <Text style={[s.ratingLbl, { color: checkinEnergy === v ? "#fff" : colors.mutedForeground }]}>{ENERGY_LABELS[v]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[s.checkinLabel, { color: colors.mutedForeground }]}>Sleep hours</Text>
              <View style={s.sleepRow}>
                {SLEEP_OPTIONS.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => { Haptics.selectionAsync(); setCheckinSleep(h); }}
                    style={[s.sleepBtn, { backgroundColor: checkinSleep === h ? "#d4a843" : colors.muted }]}
                  >
                    <Text style={[s.sleepBtnText, { color: checkinSleep === h ? "#fff" : colors.foreground }]}>{h}h</Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.checkinBtnRow}>
                <Pressable onPress={() => setCheckinExpanded(false)} style={[s.checkinSkip, { borderColor: colors.border }]}>
                  <Text style={[s.checkinSkipText, { color: colors.mutedForeground }]}>Later</Text>
                </Pressable>
                <Pressable
                  onPress={handleWizardSave}
                  style={[s.checkinSaveBtn, { backgroundColor: colors.primary, opacity: (checkinMood === 0 || checkinEnergy === 0) ? 0.4 : 1 }]}
                  disabled={checkinMood === 0 || checkinEnergy === 0 || createDailyContext.isPending}
                >
                  {createDailyContext.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[s.checkinSaveBtnText, { color: colors.primaryForeground }]}>Save check-in</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ─── Chat ─── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator colors={colors} /> : null}
          ListEmptyComponent={<EmptyState colors={colors} />}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={messages.length === 0 ? s.emptyContainer : s.msgList}
          showsVerticalScrollIndicator={false}
        />

        <View style={[s.inputBar, { paddingBottom: bottomPad + 8, borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            ref={inputRef}
            style={[s.inputField, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Message Luna…"
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

function MessageBubble({ message, colors }: { message: Message; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const isUser = message.role === "user";
  return (
    <View style={[mb.row, isUser ? mb.userRow : mb.assistantRow]}>
      {!isUser && (
        <View style={[mb.luna, { backgroundColor: colors.primary }]}>
          <Text style={mb.lunaGlyph}>☽</Text>
        </View>
      )}
      <View style={[mb.bubble, isUser ? [mb.userBubble, { backgroundColor: colors.primary }] : [mb.assistantBubble, { backgroundColor: colors.card }]]}>
        <Text style={[mb.text, { color: isUser ? colors.primaryForeground : colors.foreground }]}>
          {message.content}
        </Text>
        <Text style={[mb.time, { color: isUser ? `${colors.primaryForeground}88` : colors.mutedForeground }]}>
          {formatTime(message.ts)}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={[mb.luna, { backgroundColor: colors.primary }]}>
        <Text style={mb.lunaGlyph}>☽</Text>
      </View>
      <View style={[mb.bubble, mb.assistantBubble, { backgroundColor: colors.card }]}>
        <Text style={[mb.text, { color: colors.mutedForeground }]}>Luna is thinking…</Text>
      </View>
    </View>
  );
}

function EmptyState({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={es.container}>
      <View style={[es.avatar, { backgroundColor: colors.primary }]}>
        <Text style={es.avatarGlyph}>☽</Text>
      </View>
      <Text style={[es.heading, { color: colors.foreground }]}>Hi, I'm Luna</Text>
      <Text style={[es.sub, { color: colors.mutedForeground }]}>
        Your personal planner who knows your cycle, energy, and daily life. Ask me anything — or tell me what's on your mind.
      </Text>
      <View style={es.promptsGrid}>
        {PROMPTS.map((p, i) => (
          <View key={i} style={[es.prompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[es.promptText, { color: colors.foreground }]}>{p}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const PROMPTS = [
  "How should I schedule my week?",
  "What tasks suit my energy today?",
  "Help me plan meals for this phase",
  "I'm feeling overwhelmed, help me",
];

function TasksSheet({
  tasks, newTaskText, onNewTaskText, onAddTask, onToggle, onDelete, onClose, colors, insets, isWeb, summary,
}: {
  tasks: import("@workspace/api-client-react").Task[];
  newTaskText: string;
  onNewTaskText: (v: string) => void;
  onAddTask: () => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number; bottom: number };
  isWeb: boolean;
  summary: import("@workspace/api-client-react").TasksSummary | undefined;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <View style={[ts.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }]}>
      <View style={[ts.topRow, { paddingHorizontal: 20 }]}>
        <Text style={[ts.heading, { color: colors.foreground }]}>Tasks</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[ts.done, { color: colors.primary }]}>Done</Text>
        </Pressable>
      </View>

      {summary && (
        <View style={[ts.ringsRow, { paddingHorizontal: 20 }]}>
          <RingChart completed={summary.today?.completed ?? 0} total={summary.today?.total ?? 0} size={68} strokeWidth={5} color={colors.primary} bgColor={colors.muted} label="Today" labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <RingChart completed={summary.week?.completed ?? 0} total={summary.week?.total ?? 0} size={68} strokeWidth={5} color="#9b7fc4" bgColor={colors.muted} label="Week" labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <RingChart completed={summary.month?.completed ?? 0} total={summary.month?.total ?? 0} size={68} strokeWidth={5} color="#d4a843" bgColor={colors.muted} label="Month" labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
        </View>
      )}

      <View style={[ts.addRow, { marginHorizontal: 20, backgroundColor: colors.card, borderColor: colors.border }]}>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[ts.list, { paddingHorizontal: 20 }]}>
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

function TaskRow({ task, onToggle, onDelete, colors }: {
  task: import("@workspace/api-client-react").Task;
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

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingBottom: 14 },
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, marginBottom: 12 },
  headerDay: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular" },
  headerTitle: { fontSize: 26, fontFamily: "PlusJakartaSans_700Bold", marginTop: 1 },
  headerRight: { flexDirection: "row", gap: 8, alignItems: "center" },
  pillBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100 },
  pillBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  chipsRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 14 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium" },
  ringsRow: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "center", paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1 },
  ringDivider: { width: 1, height: 56 },
  checkinCard: { marginHorizontal: 16, marginBottom: 8, marginTop: 2, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  checkinCollapsed: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  checkinIcon: { fontSize: 22 },
  checkinTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  checkinSub: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
  checkinArrow: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  checkinArrowText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  checkinExpanded: { padding: 16, gap: 10 },
  checkinExpandedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkinClose: { fontSize: 16 },
  checkinLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  ratingRow: { flexDirection: "row", gap: 7 },
  ratingBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", gap: 3, borderWidth: 1.5 },
  ratingNum: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold" },
  ratingLbl: { fontSize: 9, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center" },
  sleepRow: { flexDirection: "row", gap: 8 },
  sleepBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  sleepBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  checkinBtnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  checkinSkip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  checkinSkipText: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  checkinSaveBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  checkinSaveBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  msgList: { paddingHorizontal: 14, paddingVertical: 8 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 14, paddingTop: 10, gap: 8, borderTopWidth: 1 },
  inputField: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", maxHeight: 110 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center", marginBottom: 1 },
  sendIcon: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
});

const mb = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 3, gap: 8 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start", paddingRight: 40 },
  luna: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 4 },
  lunaGlyph: { fontSize: 15 },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, gap: 4 },
  userBubble: { borderBottomRightRadius: 5 },
  assistantBubble: { borderBottomLeftRadius: 5 },
  text: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 22 },
  time: { fontSize: 10, fontFamily: "PlusJakartaSans_400Regular", alignSelf: "flex-end" },
});

const es = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" },
  avatarGlyph: { fontSize: 28 },
  heading: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold", textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", lineHeight: 21 },
  promptsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 },
  prompt: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
  promptText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" },
});

const ts = StyleSheet.create({
  container: { flex: 1 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  heading: { fontSize: 24, fontFamily: "PlusJakartaSans_700Bold" },
  done: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  ringsRow: { flexDirection: "row", justifyContent: "space-evenly", marginBottom: 20 },
  addRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingLeft: 14, marginBottom: 16, overflow: "hidden" },
  addInput: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", paddingVertical: 12 },
  addBtn: { width: 46, height: 46, justifyContent: "center", alignItems: "center" },
  addBtnText: { fontSize: 22 },
  list: { paddingBottom: 24 },
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
