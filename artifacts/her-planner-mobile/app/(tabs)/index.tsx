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
import { useLanguage } from "@/contexts/LanguageContext";

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

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const PHASE_EMOJI: Record<string, string> = {
  menstrual: "🌑", follicular: "🌒", ovulation: "🌕", luteal: "🌖", unknown: "🌙",
};
const PHASE_COLORS: Record<string, string> = {
  menstrual: "#e07070", follicular: "#70b070", ovulation: "#d4a843", luteal: "#9b7fc4", unknown: "#b0b0b0",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function parseTasks(content: string): { displayText: string; tasks: SuggestedTask[] } {
  const taskRegex = /\[TASKS:(\{.*?\})\]/s;
  const match = content.match(taskRegex);
  if (!match?.[1]) return { displayText: content, tasks: [] };
  try {
    const parsed = JSON.parse(match[1]) as { tasks?: SuggestedTask[] };
    return { displayText: content.replace(taskRegex, "").trim(), tasks: parsed.tasks ?? [] };
  } catch {
    return { displayText: content.replace(taskRegex, "").trim(), tasks: [] };
  }
}

export default function TodayScreen() {
  const colors = useColors();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 90 : insets.bottom;

  const [showLuna, setShowLuna] = useState(false);
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
  const phaseKey = phase?.phase ?? "unknown";
  const phaseColor = PHASE_COLORS[phaseKey] ?? PHASE_COLORS.unknown!;

  const MOOD_EN   = ["", "Awful", "Bad", "Okay", "Good", "Great"];
  const MOOD_DISP = ["", t("moodAwful"), t("moodBad"), t("moodOkay"), t("moodGood"), t("moodGreat")];
  const ENERGY_DISP = ["", t("energyNone"), t("energyLow"), t("energyMedium"), t("energyHigh"), t("energyFull")];
  const SLEEP_OPTIONS = [5, 6, 7, 8, 9];

  const todayTasks = React.useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((tk) => tk.view === "today");
  }, [tasks]);

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
          mood: MOOD_EN[checkinMood] ?? undefined,
        },
      });
      refetchCtx();
      setCheckinExpanded(false);
    } catch {}
  }

  function handlePromptTap(promptText: string) {
    void sendMessage(promptText);
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

    const assistantId = uid();
    let fullContent = "";
    let assistantAdded = false;

    try {
      const response = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/openai/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ content: text, language }),
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
              const { displayText, tasks: st } = parseTasks(fullContent);
              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  { id: assistantId, role: "assistant", content: displayText, ts: Date.now(), suggestedTasks: st },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.id === assistantId) {
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
        { id: uid(), role: "assistant", content: t("errorRetry"), ts: Date.now() },
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
    try { await updateTask.mutateAsync({ id, data: { completed: !completed } }); refetchTasks(); } catch {}
  }
  async function removeTask(id: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { await deleteTask.mutateAsync({ id }); refetchTasks(); } catch {}
  }
  async function addTask() {
    const title = newTaskText.trim();
    if (!title) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNewTaskText("");
    try { await createTask.mutateAsync({ data: { title, category: "personal", priority: "medium", view: "today" } }); refetchTasks(); } catch {}
  }

  const reversed = [...messages].reverse();
  const PROMPTS = [t("prompt1"), t("prompt2"), t("prompt3"), t("prompt4")];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ─── Dashboard ─── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.headerSection}>
          <Text style={[s.dateText, { color: colors.mutedForeground }]}>
            {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}
          </Text>
          <Text style={[s.greetingText, { color: colors.foreground }]}>
            {firstName ? `${t("welcomeBack")} ${firstName} 👋` : "Her Planner"}
          </Text>
        </View>

        {/* ── Check-in card ── */}
        {checkinNeeded && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {!checkinExpanded ? (
              <Pressable
                style={s.checkinRow}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCheckinExpanded(true); }}
              >
                <Text style={s.checkinSun}>☀️</Text>
                <Text style={[s.checkinBannerText, { color: colors.mutedForeground }]}>{t("checkinBanner")}</Text>
                <View style={[s.checkinBannerBtn, { backgroundColor: colors.primary }]}>
                  <Text style={[s.checkinBannerBtnTxt, { color: colors.primaryForeground }]}>{t("checkinStart")}</Text>
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
                moodDisp={MOOD_DISP}
                energyDisp={ENERGY_DISP}
                sleepOptions={SLEEP_OPTIONS}
                tCheckinTitle={t("checkinTitle")}
                tMood={t("checkinMood")}
                tEnergy={t("checkinEnergy")}
                tSleep={t("checkinSleep")}
                tLater={t("checkinLater")}
                tSave={t("checkinSave")}
              />
            )}
          </View>
        )}

        {/* ── Today's wellness (if checked in) ── */}
        {todayCtx && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.phasePill, { backgroundColor: phaseColor + "22" }]}>
              <Text style={s.pillEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
              <Text style={[s.pillText, { color: phaseColor }]}>
                {t(`phase${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}` as "phaseMenstrual")}
                {phase?.dayInCycle != null ? ` · Day ${phase.dayInCycle}` : ""}
              </Text>
              {phase?.nextPeriodIn != null && (
                <Text style={[s.pillText, { color: colors.mutedForeground, fontSize: 10 }]}>
                  {" · "}{t("periodIn", { n: phase.nextPeriodIn })}
                </Text>
              )}
            </View>
            <View style={s.scoreTilesRow}>
              {todayCtx.mood != null && (
                <View style={[s.scoreTile, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={s.scoreTileEmoji}>😊</Text>
                  <Text style={[s.scoreTileVal, { color: colors.primary }]}>{todayCtx.mood}</Text>
                  <Text style={[s.scoreTileLabel, { color: colors.mutedForeground }]}>{t("checkinMood")}</Text>
                </View>
              )}
              {todayCtx.energyLevel != null && (
                <View style={[s.scoreTile, { backgroundColor: "#9b7fc418" }]}>
                  <Text style={s.scoreTileEmoji}>⚡</Text>
                  <Text style={[s.scoreTileVal, { color: "#7b5fa4" }]}>{todayCtx.energyLevel}/5</Text>
                  <Text style={[s.scoreTileLabel, { color: colors.mutedForeground }]}>{t("checkinEnergy")}</Text>
                </View>
              )}
              {todayCtx.sleepHours != null && (
                <View style={[s.scoreTile, { backgroundColor: "#d4a84318" }]}>
                  <Text style={s.scoreTileEmoji}>😴</Text>
                  <Text style={[s.scoreTileVal, { color: "#b8891a" }]}>{todayCtx.sleepHours}h</Text>
                  <Text style={[s.scoreTileLabel, { color: colors.mutedForeground }]}>{t("checkinSleep")}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Task progress rings ── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("taskProgress")}</Text>
          <View style={s.ringsRow}>
            <RingChart completed={summary?.today?.completed ?? 0} total={summary?.today?.total ?? 0} size={92} strokeWidth={8} color={colors.primary} bgColor={colors.muted} label={t("today")} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
            <View style={[s.ringDiv, { backgroundColor: colors.border }]} />
            <RingChart completed={summary?.week?.completed ?? 0} total={summary?.week?.total ?? 0} size={92} strokeWidth={8} color="#9b7fc4" bgColor={colors.muted} label={t("week")} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
            <View style={[s.ringDiv, { backgroundColor: colors.border }]} />
            <RingChart completed={summary?.month?.completed ?? 0} total={summary?.month?.total ?? 0} size={92} strokeWidth={8} color="#d4a843" bgColor={colors.muted} label={t("month")} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          </View>
        </View>

        {/* ── Today's tasks ── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.cardHeaderRow}>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("todaysTasks")}</Text>
            <Pressable onPress={() => setShowTasks(true)}>
              <Text style={[s.seeAll, { color: colors.primary }]}>{t("seeAll")}</Text>
            </Pressable>
          </View>
          <View style={[s.quickAddRow, { backgroundColor: colors.muted }]}>
            <TextInput
              style={[s.quickAddInput, { color: colors.foreground }]}
              placeholder={t("addTaskPh")}
              placeholderTextColor={colors.mutedForeground}
              value={newTaskText}
              onChangeText={setNewTaskText}
              onSubmitEditing={addTask}
              returnKeyType="done"
            />
            <Pressable onPress={addTask} style={[s.quickAddBtn, { backgroundColor: colors.primary }]}>
              <Text style={[s.quickAddBtnText, { color: colors.primaryForeground }]}>+</Text>
            </Pressable>
          </View>
          {todayTasks.length === 0 ? (
            <Text style={[s.emptyTasks, { color: colors.mutedForeground }]}>{t("noTasks")}</Text>
          ) : (
            todayTasks.slice(0, 6).map((task) => (
              <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={removeTask} colors={colors} />
            ))
          )}
        </View>

        {/* ── Cycle phase card ── */}
        {phase && (
          <View style={[s.phaseCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: phaseColor }]}>
            <View style={s.phaseCardRow}>
              <Text style={s.phaseEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.phaseLabel, { color: phaseColor }]}>
                  {t(`phase${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}` as "phaseMenstrual")}
                </Text>
                {phase.dayInCycle != null && (
                  <Text style={[s.phaseSub, { color: colors.mutedForeground }]}>{t("dayOfCycle", { n: phase.dayInCycle })}</Text>
                )}
              </View>
              {phase.nextPeriodIn != null && (
                <View style={[s.nextPill, { backgroundColor: phaseColor + "22" }]}>
                  <Text style={[s.nextPillLabel, { color: phaseColor }]}>{t("nextPeriod")}</Text>
                  <Text style={[s.nextPillDays, { color: phaseColor }]}>{t("inDays", { n: phase.nextPeriodIn })}</Text>
                </View>
              )}
            </View>
            {phase.energyExpectation && (
              <Text style={[s.phaseExpect, { color: colors.mutedForeground }]}>{phase.energyExpectation}</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─── Plan with Luna button ─── */}
      <View style={[s.lunaBar, { paddingBottom: bottomPad + 6, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          style={[s.lunaBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowLuna(true); }}
        >
          <Text style={s.lunaBtnGlyph}>☽</Text>
          <Text style={[s.lunaBtnText, { color: colors.primaryForeground }]}>{t("planWithLuna")}</Text>
        </Pressable>
      </View>

      {/* ─── Luna Chat Modal ─── */}
      <Modal visible={showLuna} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLuna(false)}>
        <View style={[lm.root, { backgroundColor: colors.background }]}>
          <View style={[lm.header, { paddingTop: topPad + 10, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <View style={[lm.avatar, { backgroundColor: colors.primary }]}>
              <Text style={lm.avatarGlyph}>☽</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[lm.name, { color: colors.foreground }]}>Luna</Text>
              <Text style={[lm.sub, { color: colors.mutedForeground }]}>{t("lunaDesc")}</Text>
            </View>
            <Pressable onPress={() => setShowLuna(false)} hitSlop={12}>
              <Text style={[lm.close, { color: colors.mutedForeground }]}>✕</Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
            <FlatList
              data={reversed}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MessageBubble message={item} colors={colors} addedTasks={addedTasks} onAddTask={handleAddSuggestedTask} tSuggested={t("suggestedTasks")} />
              )}
              inverted={messages.length > 0}
              ListHeaderComponent={showTyping ? <TypingBubble colors={colors} text={t("lunaThinking")} /> : null}
              ListEmptyComponent={<EmptyState colors={colors} name={firstName} onPrompt={handlePromptTap} prompts={PROMPTS} hiPrefix={t("hiPrefix")} iAmLuna={t("iAmLuna")} desc={t("lunaDesc")} />}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={messages.length === 0 ? s.emptyContainer : s.msgList}
              showsVerticalScrollIndicator={false}
            />
            <View style={[s.inputArea, { paddingBottom: isWeb ? 34 : insets.bottom + 6, borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>{t("planYourDay")}</Text>
              <View style={s.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={[s.inputField, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={t("inputPlaceholder")}
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
                  onPress={() => { void handleSend(); inputRef.current?.focus(); }}
                  style={[s.sendBtn, { backgroundColor: inputText.trim() && !isStreaming ? colors.primary : colors.muted }]}
                  disabled={!inputText.trim() || isStreaming}
                >
                  {isStreaming
                    ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                    : <Text style={[s.sendIcon, { color: inputText.trim() ? colors.primaryForeground : colors.mutedForeground }]}>↑</Text>
                  }
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ─── Tasks Modal ─── */}
      <Modal visible={showTasks} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTasks(false)}>
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
          tDone={t("done")}
          tAddPh={t("addTaskPh")}
          tNoTasks={t("noTasks")}
          tCompleted={t("completedLabel")}
          tTasks={t("tasks")}
          tToday={t("today")}
          tWeek={t("week")}
          tMonth={t("month")}
        />
      </Modal>
    </View>
  );
}

// ─── CheckinExpanded ──────────────────────────────────────────────────────────

function CheckinExpanded({
  mood, energy, sleep,
  onMood, onEnergy, onSleep,
  onSave, onClose, isPending, colors,
  moodDisp, energyDisp, sleepOptions,
  tCheckinTitle, tMood, tEnergy, tSleep, tLater, tSave,
}: {
  mood: number; energy: number; sleep: number;
  onMood: (v: number) => void; onEnergy: (v: number) => void; onSleep: (v: number) => void;
  onSave: () => void; onClose: () => void; isPending: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  moodDisp: string[]; energyDisp: string[]; sleepOptions: number[];
  tCheckinTitle: string; tMood: string; tEnergy: string; tSleep: string; tLater: string; tSave: string;
}) {
  return (
    <View style={ce.container}>
      <View style={ce.titleRow}>
        <Text style={[ce.title, { color: colors.foreground }]}>{tCheckinTitle}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[ce.close, { color: colors.mutedForeground }]}>✕</Text>
        </Pressable>
      </View>
      <View style={ce.row}>
        <Text style={[ce.rowLabel, { color: colors.mutedForeground }]}>{tMood}</Text>
        <View style={ce.btns}>
          {[1,2,3,4,5].map((v) => (
            <Pressable key={v} onPress={() => { Haptics.selectionAsync(); onMood(v); }}
              style={[ce.btn, { backgroundColor: mood === v ? colors.primary : colors.muted }]}>
              <Text style={[ce.btnNum, { color: mood === v ? colors.primaryForeground : colors.foreground }]}>{v}</Text>
              <Text style={[ce.btnLbl, { color: mood === v ? colors.primaryForeground : colors.mutedForeground }]}>{moodDisp[v]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={ce.row}>
        <Text style={[ce.rowLabel, { color: colors.mutedForeground }]}>{tEnergy}</Text>
        <View style={ce.btns}>
          {[1,2,3,4,5].map((v) => (
            <Pressable key={v} onPress={() => { Haptics.selectionAsync(); onEnergy(v); }}
              style={[ce.btn, { backgroundColor: energy === v ? "#9b7fc4" : colors.muted }]}>
              <Text style={[ce.btnNum, { color: energy === v ? "#fff" : colors.foreground }]}>{v}</Text>
              <Text style={[ce.btnLbl, { color: energy === v ? "#fff" : colors.mutedForeground }]}>{energyDisp[v]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={ce.row}>
        <Text style={[ce.rowLabel, { color: colors.mutedForeground }]}>{tSleep}</Text>
        <View style={ce.btns}>
          {sleepOptions.map((h) => (
            <Pressable key={h} onPress={() => { Haptics.selectionAsync(); onSleep(h); }}
              style={[ce.btn, { backgroundColor: sleep === h ? "#d4a843" : colors.muted }]}>
              <Text style={[ce.btnNum, { color: sleep === h ? "#fff" : colors.foreground }]}>{h}h</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={ce.saveRow}>
        <Pressable onPress={onClose} style={[ce.skipBtn, { borderColor: colors.border }]}>
          <Text style={[ce.skipTxt, { color: colors.mutedForeground }]}>{tLater}</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={mood === 0 || energy === 0 || isPending}
          style={[ce.saveBtn, { backgroundColor: colors.primary, opacity: (mood === 0 || energy === 0) ? 0.4 : 1 }]}
        >
          {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[ce.saveTxt, { color: colors.primaryForeground }]}>{tSave}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, colors, addedTasks, onAddTask, tSuggested }: {
  message: Message;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  addedTasks: Set<string>;
  onAddTask: (msgId: string, task: SuggestedTask) => void;
  tSuggested: string;
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
        <View style={[mb.bubble, isUser ? [mb.userBubble, { backgroundColor: colors.primary }] : [mb.assistantBubble, { backgroundColor: colors.card }]]}>
          <Text style={[mb.text, { color: isUser ? colors.primaryForeground : colors.foreground }]}>{message.content}</Text>
          <Text style={[mb.time, { color: isUser ? `${colors.primaryForeground}88` : colors.mutedForeground }]}>{formatTime(message.ts)}</Text>
        </View>
        {!isUser && message.suggestedTasks && message.suggestedTasks.length > 0 && (
          <View style={mb.suggestionsWrap}>
            <Text style={[mb.suggestionsLabel, { color: colors.mutedForeground }]}>{tSuggested}</Text>
            <View style={mb.suggestionsList}>
              {message.suggestedTasks.map((task, i) => {
                const key = `${message.id}-${task.title}`;
                const added = addedTasks.has(key);
                return (
                  <Pressable key={i} onPress={() => onAddTask(message.id, task)}
                    style={[mb.suggestionPill, added
                      ? { backgroundColor: "#70b07022", borderColor: "#70b070" }
                      : { backgroundColor: colors.accent, borderColor: colors.border }]}>
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

function TypingBubble({ colors, text }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors>; text: string }) {
  return (
    <View style={[mb.row, mb.assistantRow]}>
      <View style={[mb.avatar, { backgroundColor: colors.primary }]}><Text style={mb.avatarGlyph}>☽</Text></View>
      <View style={[mb.bubble, mb.assistantBubble, { backgroundColor: colors.card }]}>
        <Text style={[mb.text, { color: colors.mutedForeground }]}>{text}</Text>
      </View>
    </View>
  );
}

function EmptyState({ colors, name, onPrompt, prompts, hiPrefix, iAmLuna, desc }: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  name: string;
  onPrompt: (text: string) => void;
  prompts: string[];
  hiPrefix: string;
  iAmLuna: string;
  desc: string;
}) {
  return (
    <View style={es.container}>
      <View style={[es.avatar, { backgroundColor: colors.primary }]}>
        <Text style={es.avatarGlyph}>☽</Text>
      </View>
      <Text style={[es.heading, { color: colors.foreground }]}>
        {name ? `${hiPrefix} ${name}, ${iAmLuna}` : iAmLuna}
      </Text>
      <Text style={[es.sub, { color: colors.mutedForeground }]}>{desc}</Text>
      <View style={es.grid}>
        {prompts.map((p, i) => (
          <Pressable
            key={i}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPrompt(p); }}
            style={({ pressed }) => [es.prompt, {
              backgroundColor: pressed ? colors.primary : colors.card,
              borderColor: pressed ? colors.primary : colors.border,
            }]}
          >
            <Text style={[es.promptText, { color: colors.foreground }]}>{p}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TasksSheet({ tasks, newTaskText, onNewTaskText, onAddTask, onToggle, onDelete, onClose, colors, insets, isWeb, summary, tDone, tAddPh, tNoTasks, tCompleted, tTasks, tToday, tWeek, tMonth }: {
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
  tDone: string; tAddPh: string; tNoTasks: string; tCompleted: string;
  tTasks: string; tToday: string; tWeek: string; tMonth: string;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <View style={[ts.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }]}>
      <View style={ts.topRow}>
        <Text style={[ts.heading, { color: colors.foreground }]}>{tTasks}</Text>
        <Pressable onPress={onClose} hitSlop={12}><Text style={[ts.done, { color: colors.primary }]}>{tDone}</Text></Pressable>
      </View>
      {summary && (
        <View style={ts.ringsRow}>
          <RingChart completed={summary.today?.completed ?? 0} total={summary.today?.total ?? 0} size={68} strokeWidth={5} color={colors.primary} bgColor={colors.muted} label={tToday} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <RingChart completed={summary.week?.completed ?? 0} total={summary.week?.total ?? 0} size={68} strokeWidth={5} color="#9b7fc4" bgColor={colors.muted} label={tWeek} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <RingChart completed={summary.month?.completed ?? 0} total={summary.month?.total ?? 0} size={68} strokeWidth={5} color="#d4a843" bgColor={colors.muted} label={tMonth} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
        </View>
      )}
      <View style={[ts.addRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput style={[ts.addInput, { color: colors.foreground }]} placeholder={tAddPh} placeholderTextColor={colors.mutedForeground} value={newTaskText} onChangeText={onNewTaskText} onSubmitEditing={onAddTask} returnKeyType="done" />
        <Pressable onPress={onAddTask} style={[ts.addBtn, { backgroundColor: colors.primary }]}>
          <Text style={[ts.addBtnText, { color: colors.primaryForeground }]}>+</Text>
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={ts.list}>
        {pending.length === 0 && done.length === 0 && <Text style={[ts.empty, { color: colors.mutedForeground }]}>{tNoTasks}</Text>}
        {pending.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} colors={colors} />)}
        {done.length > 0 && (
          <>
            <Text style={[ts.sectionLabel, { color: colors.mutedForeground }]}>{tCompleted}</Text>
            {done.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} colors={colors} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TaskRow({ task, onToggle, onDelete, colors }: {
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
      <Text style={[tr.title, { color: task.completed ? colors.mutedForeground : colors.foreground, textDecorationLine: task.completed ? "line-through" : "none" }]} numberOfLines={2}>{task.title}</Text>
      {task.category && <View style={[tr.cat, { backgroundColor: colors.muted }]}><Text style={[tr.catText, { color: colors.mutedForeground }]}>{task.category}</Text></View>}
      <Pressable onPress={() => onDelete(task.id)} hitSlop={8}><Text style={[tr.del, { color: colors.mutedForeground }]}>✕</Text></Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  // Header
  headerSection: { paddingHorizontal: 20, marginBottom: 18 },
  dateText: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginBottom: 3 },
  greetingText: { fontSize: 26, fontFamily: "PlusJakartaSans_700Bold" },
  // Card
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 16 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  seeAll: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  // Check-in
  checkinRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkinSun: { fontSize: 22 },
  checkinBannerText: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular" },
  checkinBannerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  checkinBannerBtnTxt: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  // Phase pill
  phasePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, alignSelf: "flex-start", marginBottom: 12 },
  pillEmoji: { fontSize: 13 },
  pillText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  // Score tiles
  scoreTilesRow: { flexDirection: "row", gap: 8 },
  scoreTile: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  scoreTileEmoji: { fontSize: 22, marginBottom: 4 },
  scoreTileVal: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold" },
  scoreTileLabel: { fontSize: 9, fontFamily: "PlusJakartaSans_500Medium", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  // Rings
  ringsRow: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "center" },
  ringDiv: { width: 1, height: 64 },
  // Today tasks
  quickAddRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, overflow: "hidden", marginBottom: 10 },
  quickAddInput: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", paddingHorizontal: 14, paddingVertical: 12 },
  quickAddBtn: { width: 46, height: 46, justifyContent: "center", alignItems: "center" },
  quickAddBtnText: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold" },
  emptyTasks: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", paddingVertical: 14 },
  // Phase card
  phaseCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, borderLeftWidth: 4, padding: 16 },
  phaseCardRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  phaseEmoji: { fontSize: 28 },
  phaseLabel: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold" },
  phaseSub: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
  nextPill: { borderRadius: 12, padding: 10, alignItems: "center" },
  nextPillLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_500Medium" },
  nextPillDays: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", marginTop: 1 },
  phaseExpect: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 19 },
  // Luna button bar
  lunaBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  lunaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  lunaBtnGlyph: { fontSize: 18, color: "#fff" },
  lunaBtnText: { fontSize: 17, fontFamily: "PlusJakartaSans_700Bold" },
  // Chat (used in Luna modal)
  emptyContainer: { flex: 1 },
  msgList: { paddingHorizontal: 14, paddingVertical: 8 },
  inputArea: { borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 14 },
  inputLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingBottom: 2 },
  inputField: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", maxHeight: 110 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center", marginBottom: 1 },
  sendIcon: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
});

const lm = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  avatarGlyph: { fontSize: 18, color: "#fff" },
  name: { fontSize: 17, fontFamily: "PlusJakartaSans_700Bold" },
  sub: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
  close: { fontSize: 20, paddingHorizontal: 4 },
});

const ce = StyleSheet.create({
  container: { padding: 4, gap: 10 },
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
