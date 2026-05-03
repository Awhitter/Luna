import {
  useGetProfile,
  useListCycleEntries,
  useListDailyContexts,
  useListTasks,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";

const PHASE_COLORS: Record<string, string> = {
  menstrual:  "#e07070",
  follicular: "#70b070",
  ovulation:  "#d4a843",
  luteal:     "#9b7fc4",
};
const PHASE_EMOJI: Record<string, string> = {
  menstrual: "🌑", follicular: "🌒", ovulation: "🌕", luteal: "🌖",
};

const MONTH_NAMES_EN = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function computePhase(
  date: Date,
  lastPeriodStart: Date | null,
  cycleLen: number,
  periodLen: number
): string | null {
  if (!lastPeriodStart) return null;
  const diff = Math.floor((date.getTime() - lastPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return null;
  const dayInCycle = (diff % cycleLen) + 1;
  if (dayInCycle <= periodLen) return "menstrual";
  if (dayInCycle <= 13) return "follicular";
  if (dayInCycle <= 16) return "ovulation";
  return "luteal";
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const MOOD_EMOJI: Record<string, string> = {
  Awful: "😞", Bad: "😕", Okay: "😐", Good: "🙂", Great: "😄",
  // Spanish
  Pésimo: "😞", Malo: "😕", Bien: "😐", Bueno: "🙂", "¡Genial!": "😄",
  // Portuguese
  Péssimo: "😞", Ruim: "😕", Ok: "😐", Bom: "🙂", Ótimo: "😄",
};

export default function MonthScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 90 : insets.bottom;

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<Date | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { data: profile } = useGetProfile();
  const { data: cycleEntries } = useListCycleEntries({});
  const { data: contexts } = useListDailyContexts({ limit: 120 });
  const { data: tasks } = useListTasks({});

  const cycleLen = profile?.cycleLength ?? 28;
  const periodLen = profile?.periodLength ?? 5;

  const lastPeriodStart = useMemo(() => {
    if (!cycleEntries) return null;
    const starts = cycleEntries.filter((e) => e.entryType === "period_start").sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return starts[0] ? new Date(starts[0].date) : null;
  }, [cycleEntries]);

  const contextByDate = useMemo(() => {
    const map: Record<string, typeof contexts extends (infer T)[] | undefined ? T : never> = {};
    if (contexts) for (const c of contexts) (map as Record<string, typeof c>)[c.date] = c;
    return map;
  }, [contexts]);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const todayISO = toISO(today);

  function prevMonth() {
    setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; });
  }
  function nextMonth() {
    setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; });
  }

  function handleDayPress(date: Date) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(date);
    setShowDetail(true);
  }

  const selectedISO = selected ? toISO(selected) : null;
  const selectedCtx = selectedISO ? contextByDate[selectedISO] : null;
  const selectedPhase = selected ? computePhase(selected, lastPeriodStart, cycleLen, periodLen) : null;
  const selectedTasks = tasks?.filter((task) => {
    if (!selected) return false;
    if (toISO(selected) === todayISO) return task.view === "today";
    return false;
  }) ?? [];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Month header + navigation */}
        <View style={s.navRow}>
          <Pressable onPress={prevMonth} style={[s.navBtn, { backgroundColor: colors.muted }]} hitSlop={8}>
            <Text style={[s.navArrow, { color: colors.foreground }]}>‹</Text>
          </Pressable>
          <Text style={[s.monthTitle, { color: colors.foreground }]}>
            {MONTH_NAMES_EN[viewMonth]} {viewYear}
          </Text>
          <Pressable onPress={nextMonth} style={[s.navBtn, { backgroundColor: colors.muted }]} hitSlop={8}>
            <Text style={[s.navArrow, { color: colors.foreground }]}>›</Text>
          </Pressable>
        </View>

        {/* Phase legend */}
        <View style={[s.legend, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.legendTitle, { color: colors.mutedForeground }]}>{t("cyclePhases")}</Text>
          <View style={s.legendItems}>
            {(["menstrual","follicular","ovulation","luteal"] as const).map((ph) => (
              <View key={ph} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: PHASE_COLORS[ph] }]} />
                <Text style={[s.legendText, { color: colors.foreground }]}>
                  {t(`phase${ph.charAt(0).toUpperCase() + ph.slice(1)}` as "phaseMenstrual")}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Day-of-week headers */}
        <View style={[s.dayHeaders, { paddingHorizontal: 12 }]}>
          {DAY_LABELS.map((d) => (
            <Text key={d} style={[s.dayHeader, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={[s.grid, { paddingHorizontal: 12 }]}>
          {grid.map((date, idx) => {
            if (!date) {
              return <View key={`empty-${idx}`} style={s.cell} />;
            }
            const iso = toISO(date);
            const isToday = iso === todayISO;
            const phase = computePhase(date, lastPeriodStart, cycleLen, periodLen);
            const phaseColor = phase ? PHASE_COLORS[phase] : null;
            const ctx = contextByDate[iso];
            const hasCtx = !!ctx;
            const isSelected = selectedISO === iso;

            return (
              <Pressable
                key={iso}
                onPress={() => handleDayPress(date)}
                style={[
                  s.cell,
                  phaseColor ? { backgroundColor: phaseColor + "33" } : { backgroundColor: colors.card },
                  isToday && { borderWidth: 2, borderColor: colors.primary },
                  isSelected && { borderWidth: 2, borderColor: colors.foreground },
                ]}
              >
                {/* Top row: date + check-in dot */}
                <View style={s.cellTopRow}>
                  <Text style={[
                    s.cellNum,
                    { color: isToday ? colors.primary : colors.foreground },
                    isToday && s.cellNumToday,
                  ]}>
                    {date.getDate()}
                  </Text>
                  {hasCtx ? (
                    <View style={[s.ctxDot, { backgroundColor: colors.primary }]} />
                  ) : (
                    <View style={s.ctxDotEmpty} />
                  )}
                </View>
                {/* Phase bar */}
                {phaseColor && (
                  <View style={[s.phaseBar, { backgroundColor: phaseColor }]} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Hint */}
        <Text style={[s.hint, { color: colors.mutedForeground }]}>{t("tapADay")}</Text>
      </ScrollView>

      {/* Day Detail Modal */}
      <Modal
        visible={showDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetail(false)}
      >
        <DayDetail
          date={selected}
          phase={selectedPhase}
          ctx={selectedCtx ?? null}
          tasks={selectedTasks}
          isToday={selectedISO === todayISO}
          onClose={() => setShowDetail(false)}
          colors={colors}
          insets={insets}
          isWeb={isWeb}
          t={t}
        />
      </Modal>
    </View>
  );
}

function DayDetail({
  date, phase, ctx, tasks, isToday, onClose, colors, insets, isWeb, t,
}: {
  date: Date | null;
  phase: string | null;
  ctx: { mood?: string | null; energyLevel?: number | null; sleepHours?: number | null } | null;
  tasks: { id: number; title: string; completed?: boolean | null; category?: string | null }[];
  isToday: boolean;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number; bottom: number };
  isWeb: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const phaseColor = phase ? PHASE_COLORS[phase] : colors.mutedForeground;
  const phaseEmoji = phase ? PHASE_EMOJI[phase] : "🌙";

  const dateStr = date
    ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <View style={[dd.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
      <View style={[dd.topRow, { paddingHorizontal: 20 }]}>
        <Text style={[dd.dateText, { color: colors.foreground }]}>{dateStr}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[dd.close, { color: colors.mutedForeground }]}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        {/* Phase card */}
        {phase ? (
          <View style={[dd.card, { backgroundColor: phaseColor + "22", borderColor: phaseColor + "55" }]}>
            <View style={dd.phaseRow}>
              <Text style={dd.phaseEmoji}>{phaseEmoji}</Text>
              <View>
                <Text style={[dd.phaseLabel, { color: phaseColor }]}>
                  {t(`phase${phase.charAt(0).toUpperCase() + phase.slice(1)}` as "phaseMenstrual")}
                </Text>
                <Text style={[dd.phaseDesc, { color: colors.foreground }]}>
                  {t(`phaseDesc${phase.charAt(0).toUpperCase() + phase.slice(1)}` as "phaseDescMenstrual")}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[dd.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[dd.empty, { color: colors.mutedForeground }]}>🌙 Log your period to see phase predictions</Text>
          </View>
        )}

        {/* Daily context */}
        {ctx ? (
          <View style={[dd.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[dd.sectionLabel, { color: colors.mutedForeground }]}>{t("dailyContext")}</Text>
            <View style={dd.scoresRow}>
              {ctx.mood && (
                <View style={[dd.scorePill, { backgroundColor: colors.accent }]}>
                  <Text style={dd.scoreEmoji}>{MOOD_EMOJI[ctx.mood] ?? "😐"}</Text>
                  <Text style={[dd.scoreLabel, { color: colors.foreground }]}>{ctx.mood}</Text>
                </View>
              )}
              {ctx.energyLevel != null && (
                <View style={[dd.scorePill, { backgroundColor: "#9b7fc422" }]}>
                  <Text style={dd.scoreEmoji}>⚡</Text>
                  <Text style={[dd.scoreLabel, { color: colors.foreground }]}>{t("energy")} {ctx.energyLevel}/5</Text>
                </View>
              )}
              {ctx.sleepHours != null && (
                <View style={[dd.scorePill, { backgroundColor: "#d4a84322" }]}>
                  <Text style={dd.scoreEmoji}>😴</Text>
                  <Text style={[dd.scoreLabel, { color: colors.foreground }]}>{ctx.sleepHours}h {t("sleep")}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={[dd.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[dd.sectionLabel, { color: colors.mutedForeground }]}>{t("dailyContext")}</Text>
            <Text style={[dd.empty, { color: colors.mutedForeground }]}>{t("noContext")}</Text>
          </View>
        )}

        {/* Tasks (only for today) */}
        {isToday && tasks.length > 0 && (
          <View style={[dd.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[dd.sectionLabel, { color: colors.mutedForeground }]}>{t("todayTasks")}</Text>
            {tasks.map((task) => (
              <View key={task.id} style={[dd.taskRow, { borderBottomColor: colors.border }]}>
                <View style={[dd.taskDot, { backgroundColor: task.completed ? colors.primary : colors.border }]} />
                <Text style={[dd.taskTitle, {
                  color: task.completed ? colors.mutedForeground : colors.foreground,
                  textDecorationLine: task.completed ? "line-through" : "none",
                }]} numberOfLines={2}>{task.title}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14 },
  navBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  navArrow: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", lineHeight: 26 },
  monthTitle: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  legend: { marginHorizontal: 12, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  legendTitle: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8, marginBottom: 8 },
  legendItems: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium" },
  dayHeaders: { flexDirection: "row", marginBottom: 6 },
  dayHeader: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 0.85,
    borderRadius: 10,
    padding: 4,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  cellTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 2,
  },
  cellNum: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  cellNumToday: { fontFamily: "PlusJakartaSans_700Bold" },
  phaseBar: { height: 3, width: "70%", borderRadius: 2, marginTop: 4 },
  ctxDot: { width: 7, height: 7, borderRadius: 4 },
  ctxDotEmpty: { width: 7, height: 7 },
  hint: { textAlign: "center", fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", marginTop: 12 },
});

const dd = StyleSheet.create({
  container: { flex: 1 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  dateText: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", flex: 1 },
  close: { fontSize: 18, paddingLeft: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  phaseRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  phaseEmoji: { fontSize: 30, marginTop: 2 },
  phaseLabel: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", marginBottom: 4 },
  phaseDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 19, flex: 1 },
  sectionLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8, marginBottom: 12 },
  scoresRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scorePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100 },
  scoreEmoji: { fontSize: 16 },
  scoreLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_500Medium" },
  empty: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", paddingVertical: 8 },
  taskRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  taskDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskTitle: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 20 },
});
