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

import { RingChart } from "@/components/RingChart";
import { useColors } from "@/hooks/useColors";

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

const PHASE_EMOJI: Record<string, string> = {
  menstrual: "🌑",
  follicular: "🌒",
  ovulation: "🌕",
  luteal: "🌖",
  unknown: "🌙",
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

  const phaseKey = phase?.phase ?? "unknown";
  const phaseColor = PHASE_COLORS[phaseKey] ?? PHASE_COLORS.unknown;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.heading, { color: colors.foreground, paddingHorizontal: 20 }]}>This Week</Text>

      {/* ─── Task Ring Charts ─── */}
      <View style={[s.ringCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>Task Progress</Text>
        <View style={s.ringsRow}>
          <RingChart
            completed={summary?.today?.completed ?? 0}
            total={summary?.today?.total ?? 0}
            size={88}
            strokeWidth={8}
            color={colors.primary}
            bgColor={colors.muted}
            label="Today"
            labelColor={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
          <View style={[s.ringDiv, { backgroundColor: colors.border }]} />
          <RingChart
            completed={summary?.week?.completed ?? 0}
            total={summary?.week?.total ?? 0}
            size={88}
            strokeWidth={8}
            color="#9b7fc4"
            bgColor={colors.muted}
            label="Week"
            labelColor={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
          <View style={[s.ringDiv, { backgroundColor: colors.border }]} />
          <RingChart
            completed={summary?.month?.completed ?? 0}
            total={summary?.month?.total ?? 0}
            size={88}
            strokeWidth={8}
            color="#d4a843"
            bgColor={colors.muted}
            label="Month"
            labelColor={colors.foreground}
            mutedColor={colors.mutedForeground}
          />
        </View>
      </View>

      {/* ─── Cycle Phase ─── */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: phaseColor }]}>
        <View style={s.phaseRow}>
          <Text style={s.phaseEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.phaseLabel, { color: phaseColor }]}>{PHASE_LABEL[phaseKey]}</Text>
            {phase?.dayInCycle != null && (
              <Text style={[s.phaseSub, { color: colors.mutedForeground }]}>Day {phase.dayInCycle} of cycle</Text>
            )}
          </View>
          {phase?.nextPeriodIn != null && (
            <View style={[s.nextPill, { backgroundColor: phaseColor + "22" }]}>
              <Text style={[s.nextPillLabel, { color: phaseColor }]}>next period</Text>
              <Text style={[s.nextPillDays, { color: phaseColor }]}>in {phase.nextPeriodIn}d</Text>
            </View>
          )}
        </View>
        {phase?.energyExpectation && (
          <Text style={[s.phaseExpect, { color: colors.mutedForeground }]}>{phase.energyExpectation}</Text>
        )}
      </View>

      {/* ─── Week Calendar + Energy ─── */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>Week at a glance</Text>
        <View style={s.weekGrid}>
          {weekDates.map((d, i) => {
            const iso = toISO(d);
            const isToday = iso === today;
            const energy = contextByDate[iso]?.energy ?? 0;
            const barH = energy > 0 ? (energy / 5) * 44 : 0;
            return (
              <View key={i} style={s.dayCol}>
                <Text style={[s.dayLetter, { color: isToday ? colors.primary : colors.mutedForeground }]}>
                  {DAY_NAMES[d.getDay()].slice(0, 1)}
                </Text>
                <View
                  style={[
                    s.dayBubble,
                    isToday
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: "transparent" },
                  ]}
                >
                  <Text style={[s.dayNum, { color: isToday ? colors.primaryForeground : colors.foreground }]}>
                    {d.getDate()}
                  </Text>
                </View>
                <View style={[s.energyTrack, { backgroundColor: colors.muted }]}>
                  {barH > 0 && (
                    <View
                      style={[
                        s.energyBar,
                        { height: barH, backgroundColor: colors.primary + "cc" },
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[s.barNote, { color: colors.mutedForeground }]}>Energy levels logged this week</Text>
      </View>

      {/* ─── By Category ─── */}
      {Object.keys(tasksByCategory).length > 0 && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>By Category</Text>
          {Object.entries(tasksByCategory).map(([cat, catTasks]) => {
            if (!catTasks) return null;
            const done = catTasks.filter((t) => t.completed).length;
            const total = catTasks.length;
            const pct = total > 0 ? done / total : 0;
            const clr = CATEGORY_COLORS[cat] ?? colors.primary;
            return (
              <View key={cat} style={s.catRow}>
                <View style={s.catLabelRow}>
                  <View style={[s.catDot, { backgroundColor: clr }]} />
                  <Text style={[s.catName, { color: colors.foreground }]}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                  <Text style={[s.catCount, { color: colors.mutedForeground }]}>{done}/{total}</Text>
                </View>
                <View style={[s.catTrack, { backgroundColor: colors.muted }]}>
                  <View style={[s.catFill, { backgroundColor: clr, width: `${pct * 100}%` as `${number}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {loadingTasks && (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 28, fontFamily: "PlusJakartaSans_700Bold", marginBottom: 16 },
  ringCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, padding: 18 },
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 },
  ringsRow: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "center" },
  ringDiv: { width: 1, height: 64 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  phaseEmoji: { fontSize: 28 },
  phaseLabel: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  phaseSub: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
  nextPill: { borderRadius: 12, padding: 10, alignItems: "center" },
  nextPillLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_500Medium" },
  nextPillDays: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", marginTop: 1 },
  phaseExpect: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 19 },
  weekGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  dayCol: { alignItems: "center", gap: 4, flex: 1 },
  dayLetter: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  dayBubble: { width: 26, height: 26, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  dayNum: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  energyTrack: { width: 8, height: 44, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  energyBar: { width: 8, borderRadius: 4 },
  barNote: { fontSize: 10, fontFamily: "PlusJakartaSans_400Regular", textAlign: "center", marginTop: 6 },
  catRow: { marginBottom: 12 },
  catLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  catCount: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular" },
  catTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  catFill: { height: 6, borderRadius: 3 },
  loading: { paddingVertical: 24, alignItems: "center" },
});
