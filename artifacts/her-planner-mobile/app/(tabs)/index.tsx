import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useCreateDailyContext,
  useCreateOpenaiConversation,
  useCreateTask,
  useDeleteTask,
  useListTasks,
  useUpdateTask,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let msgCounter = 0;
function uid(): string {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

let conversationInitLock = false;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(d: Date) {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const MOOD_LABELS = ["", "Awful", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["", "None", "Low", "Medium", "High", "Full"];
const SLEEP_OPTIONS = [5, 6, 7, 8, 9];

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const isWeb = Platform.OS === "web";

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardMood, setWizardMood] = useState(0);
  const [wizardEnergy, setWizardEnergy] = useState(0);
  const [wizardSleep, setWizardSleep] = useState(7);
  const [wizardNote, setWizardNote] = useState("");
  const [newTaskText, setNewTaskText] = useState("");
  const initialized = useRef(false);

  const createConversation = useCreateOpenaiConversation();
  const createDailyContext = useCreateDailyContext();
  const { data: tasks, refetch: refetchTasks } = useListTasks({});
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initConversation();
    checkWizard();
  }, []);

  async function initConversation() {
    if (conversationInitLock) return;
    conversationInitLock = true;
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
      conversationInitLock = false;
    }
  }

  async function checkWizard() {
    const shown = await AsyncStorage.getItem("luna-wizard-shown");
    if (shown !== today) {
      setShowWizard(true);
    }
  }

  async function markWizardShown() {
    await AsyncStorage.setItem("luna-wizard-shown", today);
    setShowWizard(false);
  }

  async function handleWizardSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createDailyContext.mutateAsync({
        data: {
          date: today,
          sleepHours: wizardSleep,
          energyLevel: wizardEnergy,
          mood: MOOD_LABELS[wizardMood] ?? undefined,
          notes: wizardNote || undefined,
        },
      });
    } catch {}
    await markWizardShown();
    setWizardStep(0);
    setWizardMood(0);
    setWizardEnergy(0);
    setWizardSleep(7);
    setWizardNote("");
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isStreaming || !conversationId) return;
    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: Message = { id: uid(), role: "user", content: text };
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
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
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
                  { id: uid(), role: "assistant", content: fullContent },
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
        {
          id: uid(),
          role: "assistant",
          content: "Sorry, I ran into an error. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function toggleTask(taskId: number, completed: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateTask.mutateAsync({ id: taskId, data: { completed: !completed } });
      refetchTasks();
    } catch {}
  }

  async function removeTask(taskId: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await deleteTask.mutateAsync({ id: taskId });
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

  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const reversed = [...messages].reverse();

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={styles.headerDate}>{formatDate(new Date())}</Text>
          <Text style={styles.headerTitle}>Luna</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowTasks(true)}
            style={styles.headerBtn}
            hitSlop={8}
          >
            <Text style={[styles.headerBtnText, { color: colors.primary }]}>
              Tasks
            </Text>
          </Pressable>
          {!showWizard && (
            <Pressable
              onPress={() => setShowWizard(true)}
              style={[styles.headerBtn, { marginLeft: 8 }]}
              hitSlop={8}
            >
              <Text style={[styles.headerBtnText, { color: colors.mutedForeground }]}>
                Check-in
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
          inverted={messages.length > 0}
          ListHeaderComponent={showTyping ? <TypingIndicator colors={colors} /> : null}
          ListEmptyComponent={<EmptyChat colors={colors} />}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.listContent}
        />

        <View style={[styles.inputRow, { paddingBottom: bottomPad + 8 }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="Message Luna…"
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            multiline
            returnKeyType="send"
            maxLength={1000}
          />
          <Pressable
            onPress={() => { handleSend(); inputRef.current?.focus(); }}
            style={[styles.sendBtn, { backgroundColor: isStreaming || !inputText.trim() ? colors.muted : colors.primary }]}
            disabled={isStreaming || !inputText.trim()}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.sendBtnText, { color: isStreaming || !inputText.trim() ? colors.mutedForeground : colors.primaryForeground }]}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showWizard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => markWizardShown()}
      >
        <WizardSheet
          step={wizardStep}
          mood={wizardMood}
          energy={wizardEnergy}
          sleep={wizardSleep}
          note={wizardNote}
          onMood={setWizardMood}
          onEnergy={setWizardEnergy}
          onSleep={setWizardSleep}
          onNote={setWizardNote}
          onNext={() => setWizardStep((s) => s + 1)}
          onBack={() => setWizardStep((s) => s - 1)}
          onSave={handleWizardSave}
          onSkip={() => markWizardShown()}
          colors={colors}
          saving={createDailyContext.isPending}
        />
      </Modal>

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
        />
      </Modal>
    </View>
  );
}

function MessageBubble({ message, colors }: { message: Message; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const isUser = message.role === "user";
  return (
    <View style={[msgStyles.row, isUser ? msgStyles.userRow : msgStyles.assistantRow]}>
      {!isUser && (
        <View style={[msgStyles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={msgStyles.avatarText}>☽</Text>
        </View>
      )}
      <View
        style={[
          msgStyles.bubble,
          isUser
            ? [msgStyles.userBubble, { backgroundColor: colors.primary }]
            : [msgStyles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }],
        ]}
      >
        <Text
          style={[
            msgStyles.bubbleText,
            { color: isUser ? colors.primaryForeground : colors.foreground },
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={[msgStyles.row, msgStyles.assistantRow]}>
      <View style={[msgStyles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={msgStyles.avatarText}>☽</Text>
      </View>
      <View style={[msgStyles.bubble, msgStyles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[msgStyles.bubbleText, { color: colors.mutedForeground }]}>···</Text>
      </View>
    </View>
  );
}

function EmptyChat({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={emptyChatStyles.container}>
      <Text style={[emptyChatStyles.moon, { color: colors.primary }]}>☽</Text>
      <Text style={[emptyChatStyles.title, { color: colors.foreground }]}>Good to see you</Text>
      <Text style={[emptyChatStyles.subtitle, { color: colors.mutedForeground }]}>
        Tell Luna how your day is going, ask for help with tasks, or just chat.
      </Text>
    </View>
  );
}

type Colors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function WizardSheet({
  step, mood, energy, sleep, note,
  onMood, onEnergy, onSleep, onNote,
  onNext, onBack, onSave, onSkip,
  colors, saving,
}: {
  step: number;
  mood: number; energy: number; sleep: number; note: string;
  onMood: (v: number) => void; onEnergy: (v: number) => void;
  onSleep: (v: number) => void; onNote: (v: string) => void;
  onNext: () => void; onBack: () => void;
  onSave: () => void; onSkip: () => void;
  colors: Colors; saving: boolean;
}) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const steps = ["mood", "energy", "sleep", "note"];

  return (
    <View style={[wizardStyles.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
      <View style={wizardStyles.topRow}>
        <Text style={[wizardStyles.title, { color: colors.foreground }]}>Morning Check-in</Text>
        <Pressable onPress={onSkip} hitSlop={12}>
          <Text style={[wizardStyles.skip, { color: colors.mutedForeground }]}>Skip</Text>
        </Pressable>
      </View>

      <View style={wizardStyles.progressRow}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[
              wizardStyles.dot,
              { backgroundColor: i <= step ? colors.primary : colors.border },
            ]}
          />
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={wizardStyles.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <RatingStep
            title="How are you feeling?"
            labels={MOOD_LABELS}
            value={mood}
            onChange={onMood}
            colors={colors}
          />
        )}
        {step === 1 && (
          <RatingStep
            title="What's your energy like?"
            labels={ENERGY_LABELS}
            value={energy}
            onChange={onEnergy}
            colors={colors}
          />
        )}
        {step === 2 && (
          <View style={wizardStyles.stepContainer}>
            <Text style={[wizardStyles.stepTitle, { color: colors.foreground }]}>How many hours did you sleep?</Text>
            <View style={wizardStyles.sleepRow}>
              {SLEEP_OPTIONS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => { Haptics.selectionAsync(); onSleep(h); }}
                  style={[wizardStyles.sleepBtn, {
                    backgroundColor: sleep === h ? colors.primary : colors.card,
                    borderColor: sleep === h ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[wizardStyles.sleepBtnText, { color: sleep === h ? colors.primaryForeground : colors.foreground }]}>{h}h</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {step === 3 && (
          <View style={wizardStyles.stepContainer}>
            <Text style={[wizardStyles.stepTitle, { color: colors.foreground }]}>Anything on your mind?</Text>
            <TextInput
              style={[wizardStyles.noteInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Optional note…"
              placeholderTextColor={colors.mutedForeground}
              value={note}
              onChangeText={onNote}
              multiline
              numberOfLines={4}
            />
          </View>
        )}
      </ScrollView>

      <View style={wizardStyles.btnRow}>
        {step > 0 && (
          <Pressable onPress={onBack} style={[wizardStyles.backBtn, { borderColor: colors.border }]}>
            <Text style={[wizardStyles.backBtnText, { color: colors.foreground }]}>Back</Text>
          </Pressable>
        )}
        <Pressable
          onPress={step < steps.length - 1 ? onNext : onSave}
          style={[wizardStyles.nextBtn, { backgroundColor: colors.primary, flex: step > 0 ? undefined : 1 }]}
          disabled={saving || (step === 0 && mood === 0) || (step === 1 && energy === 0)}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[wizardStyles.nextBtnText, { color: colors.primaryForeground }]}>
              {step < steps.length - 1 ? "Next" : "Start my day"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function RatingStep({ title, labels, value, onChange, colors }: {
  title: string; labels: string[]; value: number;
  onChange: (v: number) => void; colors: Colors;
}) {
  return (
    <View style={wizardStyles.stepContainer}>
      <Text style={[wizardStyles.stepTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={wizardStyles.ratingRow}>
        {[1, 2, 3, 4, 5].map((v) => (
          <Pressable
            key={v}
            onPress={() => { Haptics.selectionAsync(); onChange(v); }}
            style={[wizardStyles.ratingBtn, {
              backgroundColor: value === v ? colors.primary : colors.card,
              borderColor: value === v ? colors.primary : colors.border,
            }]}
          >
            <Text style={[wizardStyles.ratingNum, { color: value === v ? colors.primaryForeground : colors.foreground }]}>{v}</Text>
            <Text style={[wizardStyles.ratingLabel, { color: value === v ? colors.primaryForeground : colors.mutedForeground }]}>
              {labels[v]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TasksSheet({
  tasks, newTaskText, onNewTaskText, onAddTask, onToggle, onDelete, onClose, colors, insets, isWeb,
}: {
  tasks: import("@workspace/api-client-react").Task[];
  newTaskText: string;
  onNewTaskText: (v: string) => void;
  onAddTask: () => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  colors: Colors;
  insets: { top: number; bottom: number };
  isWeb: boolean;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <View style={[tasksStyles.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }]}>
      <View style={tasksStyles.topRow}>
        <Text style={[tasksStyles.title, { color: colors.foreground }]}>Tasks</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[tasksStyles.closeBtn, { color: colors.primary }]}>Done</Text>
        </Pressable>
      </View>

      <View style={[tasksStyles.addRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[tasksStyles.addInput, { color: colors.foreground }]}
          placeholder="Add a task…"
          placeholderTextColor={colors.mutedForeground}
          value={newTaskText}
          onChangeText={onNewTaskText}
          onSubmitEditing={onAddTask}
          returnKeyType="done"
        />
        <Pressable onPress={onAddTask} style={[tasksStyles.addBtn, { backgroundColor: colors.primary }]}>
          <Text style={[tasksStyles.addBtnText, { color: colors.primaryForeground }]}>+</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={tasksStyles.list}>
        {pending.length === 0 && done.length === 0 && (
          <Text style={[tasksStyles.empty, { color: colors.mutedForeground }]}>No tasks yet. Add one above.</Text>
        )}
        {pending.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} colors={colors} />
        ))}
        {done.length > 0 && (
          <>
            <Text style={[tasksStyles.sectionLabel, { color: colors.mutedForeground }]}>Completed</Text>
            {done.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} colors={colors} />
            ))}
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
  colors: Colors;
}) {
  return (
    <View style={[taskRowStyles.row, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => onToggle(task.id, task.completed ?? false)} style={taskRowStyles.check}>
        <View style={[taskRowStyles.circle, {
          borderColor: task.completed ? colors.primary : colors.border,
          backgroundColor: task.completed ? colors.primary : "transparent",
        }]}>
          {task.completed && <Text style={taskRowStyles.checkMark}>✓</Text>}
        </View>
      </Pressable>
      <Text
        style={[taskRowStyles.title, {
          color: task.completed ? colors.mutedForeground : colors.foreground,
          textDecorationLine: task.completed ? "line-through" : "none",
        }]}
        numberOfLines={2}
      >
        {task.title}
      </Text>
      <Pressable onPress={() => onDelete(task.id)} hitSlop={8} style={taskRowStyles.deleteBtn}>
        <Text style={[taskRowStyles.deleteText, { color: colors.mutedForeground }]}>✕</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    headerDate: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
      marginTop: 2,
    },
    headerActions: { flexDirection: "row", alignItems: "center" },
    headerBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 100,
      backgroundColor: colors.muted,
    },
    headerBtnText: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_600SemiBold",
    },
    listContent: { paddingHorizontal: 16, paddingBottom: 8 },
    emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10,
      fontSize: 15,
      fontFamily: "PlusJakartaSans_400Regular",
      maxHeight: 100,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    sendBtnText: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  });
}

const msgStyles = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 4, paddingHorizontal: 16 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    marginRight: 8, marginTop: 2, flexShrink: 0,
  },
  avatarText: { fontSize: 14 },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22, fontFamily: "PlusJakartaSans_400Regular" },
});

const emptyChatStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  moon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", lineHeight: 22 },
});

const wizardStyles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold" },
  skip: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular" },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  scrollContent: { paddingBottom: 24 },
  stepContainer: { gap: 20 },
  stepTitle: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", lineHeight: 28 },
  ratingRow: { flexDirection: "row", gap: 8 },
  ratingBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  ratingNum: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold" },
  ratingLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center" },
  sleepRow: { flexDirection: "row", gap: 8 },
  sleepBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  sleepBtnText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    height: 120,
    textAlignVertical: "top",
  },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  backBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
  nextBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  nextBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
});

const tasksStyles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold" },
  closeBtn: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    marginBottom: 20,
    overflow: "hidden",
  },
  addInput: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", paddingVertical: 12 },
  addBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  addBtnText: { fontSize: 22, fontFamily: "PlusJakartaSans_400Regular" },
  list: { paddingBottom: 24 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular" },
  sectionLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
});

const taskRowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  check: { flexShrink: 0 },
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  checkMark: { fontSize: 12, color: "#fff" },
  title: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 21 },
  deleteBtn: { flexShrink: 0 },
  deleteText: { fontSize: 14 },
});
