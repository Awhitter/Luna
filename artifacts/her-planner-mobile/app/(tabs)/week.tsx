import {
  useGetCurrentCyclePhase,
  useGetTasksSummary,
  useListDailyContexts,
  useListTasks,
} from "@workspace/api-client-react";
import React from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RingChart } from "@/components/RingChart";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { PHASE_COLORS, PHASE_EMOJI } from "@/constants/cycle";

const DAY_LETTERS_EN = ["S","M","T","W","T","F","S"];

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

function toISO(d: Date) { return d.toISOString().split("T")[0]; }

const CAT_COLORS: Record<string, string> = {
  work: "#c0788a", personal: "#9b7fc4", kids: "#d4a843", health: "#70b070",
  errands: "#d49843", chores: "#7fb8c4", food: "#a87c5f", "self-care": "#c47fbe",
};
const CAT_KEYS: Record<string, string> = {
  work: "catWork", personal: "catPersonal", kids: "catKids", health: "catHealth",
  errands: "catErrands", chores: "catChores", food: "catFood", "self-care": "catSelfCare",
};
const MOOD_EMOJI_MAP: Record<string, string> = {
  happy: "😊", calm: "😌", tired: "😴", anxious: "😟", sad: "😢", energetic: "⚡", irritable: "😠", focused: "🎯",
};

export default function WeekScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const weekDates = getWeekDates();
  const todayISO = toISO(new Date());

  const { data: tasks, isLoading: loadingTasks } = useListTasks({});
  const { data: summary } = useGetTasksSummary();
  const { data: phase } = useGetCurrentCyclePhase();
  const { data: contexts } = useListDailyContexts({ limit: 7 });

  const contextByDate = React.useMemo(() => {
    const map: Record<string, { energy?: number | null; sleep?: number | null; mood?: string | null }> = {};
    if (contexts) for (const ctx of contexts) map[ctx.date] = { energy: ctx.energyLevel, sleep: ctx.sleepHours, mood: ctx.mood };
    return map;
  }, [contexts]);

  const weeklySummary = React.useMemo(() => {
    const entries = weekDates.map((d) => contextByDate[toISO(d)]).filter(Boolean);
    const tracked = entries.length;
    const energyVals = entries.map((e) => e?.energy).filter((v): v is number => v != null);
    const sleepVals  = entries.map((e) => e?.sleep).filter((v): v is number => v != null);
    const moods      = entries.map((e) => e?.mood).filter((v): v is string => !!v);
    const avgEnergy  = energyVals.length > 0 ? energyVals.reduce((a, b) => a + b, 0) / energyVals.length : null;
    const avgSleep   = sleepVals.length > 0  ? sleepVals.reduce((a, b) => a + b, 0)  / sleepVals.length  : null;
    const moodFreq: Record<string, number> = {};
    for (const m of moods) moodFreq[m] = (moodFreq[m] ?? 0) + 1;
    const topMood = moods.length > 0 ? Object.entries(moodFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    return { tracked, avgEnergy, avgSleep, topMood };
  }, [contextByDate, weekDates]);

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
      <Text style={[s.heading, { color: colors.foreground, paddingHorizontal: 20 }]}>{t("thisWeek")}</Text>

      {/* Weekly Wellness Summary Strip */}
      {weeklySummary.tracked > 0 && (
        <View style={[s.wellnessStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: 12 }]}>{t("weekWellness")}</Text>
          <View style={s.wellnessRow}>
            {/* Days tracked */}
            <View style={[s.wellnessTile, { backgroundColor: colors.primary + "18" }]}>
              <Text style={s.wellnessTileValue}>{weeklySummary.tracked}</Text>
              <Text style={[s.wellnessTileLabel, { color: colors.mutedForeground }]}>{t("daysTracked")}</Text>
            </View>
            {/* Avg energy */}
            {weeklySummary.avgEnergy != null && (
              <View style={[s.wellnessTile, { backgroundColor: "#d4a84318" }]}>
                <Text style={[s.wellnessTileValue, { color: "#b8891a" }]}>
                  ⚡ {weeklySummary.avgEnergy.toFixed(1)}<Text style={s.wellnessTileUnit}>/5</Text>
                </Text>
                <Text style={[s.wellnessTileLabel, { color: colors.mutedForeground }]}>{t("avgEnergy")}</Text>
              </View>
            )}
            {/* Avg sleep */}
            {weeklySummary.avgSleep != null && (
              <View style={[s.wellnessTile, { backgroundColor: "#9b7fc418" }]}>
                <Text style={[s.wellnessTileValue, { color: "#7b5fa4" }]}>
                  😴 {weeklySummary.avgSleep.toFixed(1)}<Text style={s.wellnessTileUnit}>h</Text>
                </Text>
                <Text style={[s.wellnessTileLabel, { color: colors.mutedForeground }]}>{t("avgSleep")}</Text>
              </View>
            )}
            {/* Top mood */}
            {weeklySummary.topMood && (
              <View style={[s.wellnessTile, { backgroundColor: "#70b07018" }]}>
                <Text style={s.wellnessTileEmoji}>{MOOD_EMOJI_MAP[weeklySummary.topMood] ?? "😐"}</Text>
                <Text style={[s.wellnessTileLabel, { color: colors.mutedForeground }]}>{t("topMood")}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Rings */}
      <View style={[s.ringCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("taskProgress")}</Text>
        <View style={s.ringsRow}>
          <RingChart completed={summary?.today?.completed ?? 0} total={summary?.today?.total ?? 0} size={88} strokeWidth={8} color={colors.primary} bgColor={colors.muted} label={t("today")} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <View style={[s.ringDiv, { backgroundColor: colors.border }]} />
          <RingChart completed={summary?.week?.completed ?? 0} total={summary?.week?.total ?? 0} size={88} strokeWidth={8} color="#9b7fc4" bgColor={colors.muted} label={t("week")} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
          <View style={[s.ringDiv, { backgroundColor: colors.border }]} />
          <RingChart completed={summary?.month?.completed ?? 0} total={summary?.month?.total ?? 0} size={88} strokeWidth={8} color="#d4a843" bgColor={colors.muted} label={t("month")} labelColor={colors.foreground} mutedColor={colors.mutedForeground} />
        </View>
      </View>

      {/* Phase card */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: phaseColor }]}>
        <View style={s.phaseRow}>
          <Text style={s.phaseEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.phaseLabel, { color: phaseColor }]}>
              {t(`phase${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}` as "phaseMenstrual")}
            </Text>
            {phase?.dayInCycle != null && (
              <Text style={[s.phaseSub, { color: colors.mutedForeground }]}>{t("dayOfCycle", { n: phase.dayInCycle })}</Text>
            )}
          </View>
          {phase?.nextPeriodIn != null && (
            <View style={[s.nextPill, { backgroundColor: phaseColor + "22" }]}>
              <Text style={[s.nextPillLabel, { color: phaseColor }]}>{t("nextPeriod")}</Text>
              <Text style={[s.nextPillDays, { color: phaseColor }]}>{t("inDays", { n: phase.nextPeriodIn })}</Text>
            </View>
          )}
        </View>
        {phase?.energyExpectation && (
          <Text style={[s.phaseExpect, { color: colors.mutedForeground }]}>{phase.energyExpectation}</Text>
        )}
      </View>

      {/* Week chart — energy + sleep bars + mood emoji */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("weekAtGlance")}</Text>
        <View style={s.chartGrid}>
          {weekDates.map((d, i) => {
            const iso = toISO(d);
            const isToday = iso === todayISO;
            const ctx = contextByDate[iso];
            const energy = ctx?.energy ?? 0;
            const sleep  = ctx?.sleep  ?? 0;
            const mood   = ctx?.mood   ?? null;
            const BAR_MAX = 80;
            const energyH = energy > 0 ? (energy / 5) * BAR_MAX : 0;
            const sleepH  = sleep  > 0 ? Math.max(4, Math.min(sleep, 10) - 4) / 6 * BAR_MAX : 0;
            const hasData = energy > 0 || sleep > 0;
            return (
              <View key={i} style={s.chartCol}>
                {/* Day label */}
                <Text style={[s.chartLetter, { color: isToday ? colors.primary : colors.mutedForeground }]}>
                  {DAY_LETTERS_EN[d.getDay()]}
                </Text>
                <View style={[s.chartBubble, isToday && { backgroundColor: colors.primary }]}>
                  <Text style={[s.chartNum, { color: isToday ? colors.primaryForeground : colors.foreground }]}>
                    {d.getDate()}
                  </Text>
                </View>
                {/* Bar area */}
                <View style={[s.barsArea, { height: BAR_MAX }]}>
                  {!hasData && (
                    <View style={[s.emptyBarTrack, { backgroundColor: colors.muted + "66" }]} />
                  )}
                  {hasData && (
                    <>
                      {/* Energy bar */}
                      <View style={[s.barTrack, { backgroundColor: colors.muted }]}>
                        {energyH > 0 && (
                          <View style={[s.bar, { height: energyH, backgroundColor: "#d4a843dd" }]} />
                        )}
                      </View>
                      {/* Sleep bar */}
                      <View style={[s.barTrack, { backgroundColor: colors.muted }]}>
                        {sleepH > 0 && (
                          <View style={[s.bar, { height: sleepH, backgroundColor: "#9b7fc4dd" }]} />
                        )}
                      </View>
                    </>
                  )}
                </View>
                {/* Mood emoji */}
                <Text style={s.chartMood}>
                  {mood ? (MOOD_EMOJI_MAP[mood.toLowerCase()] ?? "😐") : " "}
                </Text>
              </View>
            );
          })}
        </View>
        {/* Legend */}
        <View style={s.chartLegend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#d4a843" }]} />
            <Text style={[s.legendLabel, { color: colors.mutedForeground }]}>{t("checkinEnergy")}</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#9b7fc4" }]} />
            <Text style={[s.legendLabel, { color: colors.mutedForeground }]}>{t("checkinSleep")}</Text>
          </View>
          <View style={s.legendItem}>
            <Text style={s.legendEmoji}>😊</Text>
            <Text style={[s.legendLabel, { color: colors.mutedForeground }]}>{t("checkinMood")}</Text>
          </View>
        </View>
      </View>

      {/* By Category */}
      {Object.keys(tasksByCategory).length > 0 && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("byCategory")}</Text>
          {Object.entries(tasksByCategory).map(([cat, catTasks]) => {
            if (!catTasks) return null;
            const done = catTasks.filter((t) => t.completed).length;
            const total = catTasks.length;
            const pct = total > 0 ? done / total : 0;
            const clr = CAT_COLORS[cat] ?? colors.primary;
            const labelKey = CAT_KEYS[cat] ?? "catPersonal";
            return (
              <View key={cat} style={s.catRow}>
                <View style={s.catLabelRow}>
                  <View style={[s.catDot, { backgroundColor: clr }]} />
                  <Text style={[s.catName, { color: colors.foreground }]}>{t(labelKey)}</Text>
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

      {loadingTasks && <View style={s.loading}><ActivityIndicator color={colors.primary} /></View>}
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
  chartGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  chartCol: { alignItems: "center", gap: 3, flex: 1 },
  chartLetter: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  chartBubble: { width: 26, height: 26, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  chartNum: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  barsArea: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 2, width: "100%" },
  barTrack: { flex: 1, maxWidth: 10, borderRadius: 5, overflow: "hidden", justifyContent: "flex-end" },
  bar: { borderRadius: 5, width: "100%" },
  emptyBarTrack: { width: 6, height: "100%", borderRadius: 3 },
  chartMood: { fontSize: 14, height: 20, textAlign: "center" },
  chartLegend: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendEmoji: { fontSize: 11, lineHeight: 14 },
  legendLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_400Regular" },
  catRow: { marginBottom: 12 },
  catLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  catCount: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular" },
  catTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  catFill: { height: 6, borderRadius: 3 },
  loading: { paddingVertical: 24, alignItems: "center" },
  wellnessStrip: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  wellnessRow: { flexDirection: "row", gap: 8 },
  wellnessTile: {
    flex: 1, borderRadius: 14, padding: 10, alignItems: "center", justifyContent: "center", minHeight: 64,
  },
  wellnessTileValue: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold", color: "#c0788a" },
  wellnessTileUnit: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular" },
  wellnessTileEmoji: { fontSize: 22, lineHeight: 28 },
  wellnessTileLabel: { fontSize: 9, fontFamily: "PlusJakartaSans_500Medium", textAlign: "center", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
});
