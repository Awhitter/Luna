import {
  useCreateCycleEntry,
  useGetCurrentCyclePhase,
  useListCycleEntries,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

const PHASE_INFO: Record<
  string,
  { color: string; emoji: string; description: string; energy: string; recommendations: string[] }
> = {
  menstrual: {
    color: "#e07070",
    emoji: "🌑",
    description: "Your body is shedding and renewing. Rest is your superpower right now.",
    energy: "Rest & restore",
    recommendations: ["Gentle movement", "Warm nourishing foods", "Sleep in if you can", "Say no to big commitments"],
  },
  follicular: {
    color: "#70b070",
    emoji: "🌒",
    description: "Estrogen rises and so does your energy. Great time to start new things.",
    energy: "Rising energy",
    recommendations: ["Try something new", "Plan ahead", "Social activities", "Creative work"],
  },
  ovulation: {
    color: "#d4a843",
    emoji: "🌕",
    description: "Peak energy and social energy. You're radiant and magnetic today.",
    energy: "Peak energy",
    recommendations: ["Networking & meetings", "High-intensity workouts", "Bold conversations", "Date night"],
  },
  luteal: {
    color: "#9b7fc4",
    emoji: "🌖",
    description: "Progesterone rises. You may crave comfort and quiet. Honor that.",
    energy: "Wind down",
    recommendations: ["Finish existing tasks", "Reduce screen time", "Magnesium-rich foods", "Cozy time at home"],
  },
  unknown: {
    color: "#b0b0b0",
    emoji: "🌙",
    description: "Log your period start to get cycle phase predictions.",
    energy: "Unknown",
    recommendations: ["Log your cycle", "Track your symptoms", "Note your energy levels"],
  },
};

const PHASE_LABEL: Record<string, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
  unknown: "Cycle",
};

import type { CreateCycleEntryBodyEntryType } from "@workspace/api-client-react";

const ENTRY_TYPES: { value: CreateCycleEntryBodyEntryType; label: string }[] = [
  { value: "period_start", label: "Period Start" },
  { value: "period_end", label: "Period End" },
  { value: "ovulation", label: "Ovulation" },
  { value: "symptom", label: "Symptom" },
  { value: "note", label: "Note" },
];

const SYMPTOMS = ["Cramps", "Headache", "Bloating", "Tender breasts", "Mood swings", "Fatigue", "Acne", "Cravings"];

function formatEntryDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CycleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const [showLog, setShowLog] = useState(false);
  const [logType, setLogType] = useState<CreateCycleEntryBodyEntryType>("period_start");
  const [logSymptoms, setLogSymptoms] = useState<string[]>([]);

  const { data: phase, isLoading: loadingPhase, refetch: refetchPhase } = useGetCurrentCyclePhase();
  const { data: entries, isLoading: loadingEntries, refetch: refetchEntries } = useListCycleEntries({});
  const createEntry = useCreateCycleEntry();

  const phaseKey = phase?.phase ?? "unknown";
  const info = PHASE_INFO[phaseKey] ?? PHASE_INFO.unknown;

  async function handleLog() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createEntry.mutateAsync({
        data: {
          entryType: logType,
          date: new Date().toISOString().split("T")[0],
          symptoms: logSymptoms.length > 0 ? logSymptoms.join(", ") : undefined,
        },
      });
      setShowLog(false);
      setLogSymptoms([]);
      setLogType("period_start");
      refetchPhase();
      refetchEntries();
    } catch {}
  }

  function toggleSymptom(s: string) {
    Haptics.selectionAsync();
    setLogSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.titleRow}>
          <Text style={[s.heading, { color: colors.foreground }]}>Cycle</Text>
          <Pressable
            onPress={() => setShowLog(true)}
            style={[s.logBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.logBtnText, { color: colors.primaryForeground }]}>+ Log</Text>
          </Pressable>
        </View>

        {loadingPhase ? (
          <View style={s.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={[s.phaseCard, { backgroundColor: info.color + "22", borderColor: info.color + "55" }]}>
            <View style={s.phaseCardTop}>
              <View>
                <Text style={[s.phaseEmoji]}>{info.emoji}</Text>
                <Text style={[s.phaseLabel, { color: info.color }]}>
                  {PHASE_LABEL[phaseKey]}
                </Text>
                {phase?.dayInCycle != null && (
                  <Text style={[s.phaseDayText, { color: colors.mutedForeground }]}>
                    Day {phase.dayInCycle}
                  </Text>
                )}
              </View>
              {phase?.nextPeriodIn != null && (
                <View style={[s.nextPeriodBadge, { backgroundColor: info.color + "33" }]}>
                  <Text style={[s.nextPeriodLabel, { color: info.color }]}>Next period</Text>
                  <Text style={[s.nextPeriodDays, { color: info.color }]}>
                    in {phase.nextPeriodIn}d
                  </Text>
                </View>
              )}
            </View>

            <Text style={[s.phaseDesc, { color: colors.foreground }]}>{info.description}</Text>

            <View style={[s.energyBadge, { backgroundColor: info.color + "33" }]}>
              <Text style={[s.energyBadgeText, { color: info.color }]}>{info.energy}</Text>
            </View>

            <View style={s.recSection}>
              <Text style={[s.recTitle, { color: colors.mutedForeground }]}>RECOMMENDATIONS</Text>
              {info.recommendations.map((rec, i) => (
                <View key={i} style={s.recRow}>
                  <View style={[s.recDot, { backgroundColor: info.color }]} />
                  <Text style={[s.recText, { color: colors.foreground }]}>{rec}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {entries && entries.length > 0 && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>Recent Entries</Text>
            {entries.slice(0, 8).map((entry, i) => (
              <View
                key={entry.id ?? i}
                style={[s.entryRow, { borderBottomColor: colors.border, borderBottomWidth: i < Math.min(entries.length, 8) - 1 ? 1 : 0 }]}
              >
                <View style={[s.entryDot, { backgroundColor: PHASE_INFO[entry.entryType ?? "unknown"]?.color ?? colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.entryType, { color: colors.foreground }]}>
                    {ENTRY_TYPES.find((t) => t.value === entry.entryType)?.label ?? entry.entryType}
                  </Text>
                  {entry.symptoms && (
                    <Text style={[s.entrySymptoms, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {entry.symptoms}
                    </Text>
                  )}
                </View>
                <Text style={[s.entryDate, { color: colors.mutedForeground }]}>
                  {formatEntryDate(entry.date)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {loadingEntries && (
          <View style={s.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showLog}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLog(false)}
      >
        <LogSheet
          logType={logType}
          symptoms={logSymptoms}
          onType={setLogType}
          onToggleSymptom={toggleSymptom}
          onSave={handleLog}
          onClose={() => setShowLog(false)}
          saving={createEntry.isPending}
          colors={colors}
          insets={insets}
          isWeb={isWeb}
        />
      </Modal>
    </View>
  );
}

function LogSheet({
  logType, symptoms, onType, onToggleSymptom, onSave, onClose, saving, colors, insets, isWeb,
}: {
  logType: CreateCycleEntryBodyEntryType;
  symptoms: string[];
  onType: (v: CreateCycleEntryBodyEntryType) => void;
  onToggleSymptom: (s: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number; bottom: number };
  isWeb: boolean;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  return (
    <View style={[logStyles.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
      <View style={[logStyles.topRow, { paddingHorizontal: 20 }]}>
        <Text style={[logStyles.title, { color: colors.foreground }]}>Log Entry</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[logStyles.cancel, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[logStyles.content, { paddingHorizontal: 20 }]} keyboardShouldPersistTaps="handled">
        <Text style={[logStyles.sectionLabel, { color: colors.mutedForeground }]}>TYPE</Text>
        <View style={logStyles.typeGrid}>
          {ENTRY_TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => { Haptics.selectionAsync(); onType(t.value); }}
              style={[logStyles.typeBtn, {
                backgroundColor: logType === t.value ? colors.primary : colors.card,
                borderColor: logType === t.value ? colors.primary : colors.border,
              }]}
            >
              <Text style={[logStyles.typeBtnText, { color: logType === t.value ? colors.primaryForeground : colors.foreground }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[logStyles.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>SYMPTOMS (OPTIONAL)</Text>
        <View style={logStyles.symptomGrid}>
          {SYMPTOMS.map((sym) => (
            <Pressable
              key={sym}
              onPress={() => onToggleSymptom(sym)}
              style={[logStyles.symptomBtn, {
                backgroundColor: symptoms.includes(sym) ? colors.accent : colors.card,
                borderColor: symptoms.includes(sym) ? colors.primary : colors.border,
              }]}
            >
              <Text style={[logStyles.symptomText, { color: symptoms.includes(sym) ? colors.primary : colors.foreground }]}>
                {sym}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[logStyles.footer, { paddingHorizontal: 20 }]}>
        <Pressable
          onPress={onSave}
          style={[logStyles.saveBtn, { backgroundColor: colors.primary }]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[logStyles.saveBtnText, { color: colors.primaryForeground }]}>Save Entry</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 28, fontFamily: "PlusJakartaSans_700Bold" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  logBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
  logBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },
  loading: { paddingVertical: 40, alignItems: "center" },
  phaseCard: { borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 16 },
  phaseCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  phaseEmoji: { fontSize: 32, marginBottom: 6 },
  phaseLabel: { fontSize: 24, fontFamily: "PlusJakartaSans_700Bold" },
  phaseDayText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", marginTop: 2 },
  nextPeriodBadge: { borderRadius: 12, padding: 12, alignItems: "center" },
  nextPeriodLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium" },
  nextPeriodDays: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", marginTop: 2 },
  phaseDesc: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 23, marginBottom: 12 },
  energyBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginBottom: 16 },
  energyBadgeText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  recSection: { gap: 8 },
  recTitle: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8 },
  recRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  recDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  recText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  entryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  entryDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  entryType: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  entrySymptoms: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginTop: 2 },
  entryDate: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", flexShrink: 0 },
});

const logStyles = StyleSheet.create({
  container: { flex: 1 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold" },
  cancel: { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular" },
  content: { paddingBottom: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8, marginBottom: 12 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, borderWidth: 1 },
  typeBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  symptomGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symptomBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  symptomText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" },
  footer: { paddingTop: 16 },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
});
