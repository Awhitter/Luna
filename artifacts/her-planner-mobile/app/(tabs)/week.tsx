import {
  useGetCurrentCyclePhase,
  useGetTasksSummary,
  useListDailyContexts,
  useListTasks,
} from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDates(): Date[] {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

const PHASE_COLORS: Record<string, string> = {
  menstrual: "#e07070",
  follicular: "#70b070",
  ovulation: "#d4a843",
  luteal: "#9b7fc4",
  unknown: "#b0b0b0",
};

const PHASE_LABEL: Record<string, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
  unknown: "—",
};

const CATEGORY_COLORS: Record<string, string> = {
  work: "#c0788a",
  personal: "#9b7fc4",
  kids: "#d4a843",
  health: "#70b070",
  errands: "#d49843",
  chores: "#7fb8c4",
};

export default function WeekScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const weekDates = getWeekDates();
  const today = toISO(new Date());
  const weekStart = toISO(weekDates[0]);
  const weekEnd = toISO(weekDates[6]);

  const { data: tasks, isLoading: loadingTasks } = useListTasks({});
  const { data: summary } = useGetTasksSummary();
  const { data: phase } = useGetCurrentCyclePhase();
  const { data: contexts } = useListDailyContexts({ limit: 7 });

  const contextByDate = React.useMemo(() => {
    const map: Record<string, { energy?: number | null }> = {};
    if (contexts) {
      for (const ctx of contexts) {
        map[ctx.date] = { energy: ctx.energyLevel };
      }
    }
    return map;
  }, [contexts]);

  type TaskArr = NonNullable<typeof tasks>;
  const tasksByCategory = React.useMemo(() => {
    if (!tasks) return {} as Record<string, TaskArr>;
    const map: Record<string, TaskArr> = {};
    for (const t of tasks) {
      const cat = t.category ?? "personal";
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    }
    return map;
  }, [tasks]);

  const completedCount = tasks?.filter((t) => t.completed).length ?? 0;
  const totalCount = tasks?.length ?? 0;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const phaseColor = phase ? PHASE_COLORS[phase.phase] ?? PHASE_COLORS.unknown : PHASE_COLORS.unknown;

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: colors.background }]}
      contentContainerStyle={[{ paddingTop: topPad + 16, paddingBottom: bottomPad + 24, paddingHorizontal: 20 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.heading, { color: colors.foreground }]}>This Week</Text>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>Cycle Phase</Text>
        <View style={s.phaseRow}>
          <View style={[s.phaseDot, { backgroundColor: phaseColor }]} />
          <Text style={[s.phaseLabel, { color: colors.foreground }]}>
            {phase ? PHASE_LABEL[phase.phase] : "—"}
          </Text>
          {phase?.dayInCycle != null && (
            <Text style={[s.phaseSub, { color: colors.mutedForeground }]}>
              Day {phase.dayInCycle}
            </Text>
          )}
        </View>
        {phase?.energyExpectation && (
          <Text style={[s.phaseExpect, { color: colors.mutedForeground }]}>
            {phase.energyExpectation}
          </Text>
        )}
      </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.taskHeader}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>Tasks</Text>
          <Text style={[s.taskCount, { color: colors.mutedForeground }]}>
            {completedCount}/{totalCount}
          </Text>
        </View>
        <View style={[s.progressBg, { backgroundColor: colors.muted }]}>
          <View style={[s.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` as `${number}%` }]} />
        </View>
      </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>Week Overview</Text>
        <View style={s.weekRow}>
          {weekDates.map((d, i) => {
            const iso = toISO(d);
            const isToday = iso === today;
            const ctx = contextByDate[iso];
            const energy = ctx?.energy ?? 0;
            return (
              <View key={i} style={s.dayCol}>
                <Text style={[s.dayLetter, { color: isToday ? colors.primary : colors.mutedForeground }]}>
                  {DAY_NAMES[d.getDay()].slice(0, 1)}
                </Text>
                <Text style={[s.dayNum, {
                  color: isToday ? colors.primaryForeground : colors.foreground,
                  backgroundColor: isToday ? colors.primary : "transparent",
                }]}>
                  {d.getDate()}
                </Text>
                <View style={[s.energyBar, { backgroundColor: colors.muted }]}>
                  <View style={[s.energyFill, {
                    backgroundColor: energy > 0 ? colors.primary : "transparent",
                    height: `${(energy / 5) * 100}%` as `${number}%`,
                  }]} />
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[s.barLabel, { color: colors.mutedForeground }]}>Energy levels this week</Text>
      </View>

      {Object.keys(tasksByCategory).length > 0 && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>By Category</Text>
          {Object.entries(tasksByCategory).map(([cat, catTasks]) => {
            if (!catTasks) return null;
            const done = catTasks.filter((t) => t.completed).length;
            const total = catTasks.length;
            const pct = total > 0 ? done / total : 0;
            const color = CATEGORY_COLORS[cat] ?? colors.primary;
            return (
              <View key={cat} style={s.catRow}>
                <View style={s.catLabelRow}>
                  <View style={[s.catDot, { backgroundColor: color }]} />
                  <Text style={[s.catName, { color: colors.foreground }]}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                  <Text style={[s.catCount, { color: colors.mutedForeground }]}>{done}/{total}</Text>
                </View>
                <View style={[s.catBar, { backgroundColor: colors.muted }]}>
                  <View style={[s.catBarFill, { backgroundColor: color, width: `${pct * 100}%` as `${number}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {loadingTasks && (
        <View style={s.loadingRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 28, fontFamily: "PlusJakartaSans_700Bold", marginBottom: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  phaseDot: { width: 12, height: 12, borderRadius: 6 },
  phaseLabel: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  phaseSub: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular" },
  phaseExpect: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 20 },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  taskCount: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  progressBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dayCol: { alignItems: "center", gap: 4, flex: 1 },
  dayLetter: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  dayNum: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", width: 26, height: 26, borderRadius: 13, textAlign: "center", lineHeight: 26 },
  energyBar: { width: 6, height: 32, borderRadius: 3, overflow: "hidden", justifyContent: "flex-end" },
  energyFill: { width: 6, borderRadius: 3 },
  barLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", marginTop: 4 },
  catRow: { marginBottom: 12 },
  catLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  catCount: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" },
  catBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  catBarFill: { height: 6, borderRadius: 3 },
  loadingRow: { paddingVertical: 20, alignItems: "center" },
});
