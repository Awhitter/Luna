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
import { useLanguage } from "@/contexts/LanguageContext";

import type { CreateCycleEntryBodyEntryType } from "@workspace/api-client-react";

const PHASE_COLORS: Record<string, string> = {
  menstrual: "#e07070", follicular: "#70b070", ovulation: "#d4a843", luteal: "#9b7fc4", unknown: "#b0b0b0",
};
const PHASE_EMOJI: Record<string, string> = {
  menstrual: "🌑", follicular: "🌒", ovulation: "🌕", luteal: "🌖", unknown: "🌙",
};

function formatEntryDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CycleScreen() {
  const colors = useColors();
  const { t } = useLanguage();
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
  const phaseColor = PHASE_COLORS[phaseKey] ?? PHASE_COLORS.unknown;

  // Phase descriptions use translations
  const phaseDescKey = `phaseDesc${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}` as "phaseDescMenstrual";
  const energyKey = `energy${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}` as "energyMenstrual";
  const recKeys = [0,1,2,3].map((i) => `rec${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}${i}` as "recMenstrual0");

  const ENTRY_TYPE_MAP: Record<CreateCycleEntryBodyEntryType, string> = {
    period_start: t("entryPeriodStart"),
    period_end:   t("entryPeriodEnd"),
    ovulation:    t("entryOvulation"),
    symptom:      t("entrySymptom"),
    note:         t("entryNote"),
  };

  const ENTRY_TYPES: { value: CreateCycleEntryBodyEntryType; label: string }[] = [
    { value: "period_start", label: t("entryPeriodStart") },
    { value: "period_end",   label: t("entryPeriodEnd")   },
    { value: "ovulation",    label: t("entryOvulation")   },
    { value: "symptom",      label: t("entrySymptom")     },
    { value: "note",         label: t("entryNote")        },
  ];

  const SYMPTOMS_KEYS = [
    "symCramps","symHeadache","symBloating","symTenderBreasts",
    "symMoodSwings","symFatigue","symAcne","symCravings",
  ] as const;
  const SYMPTOMS = SYMPTOMS_KEYS.map((k) => ({ key: k, label: t(k) }));

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

  function toggleSymptom(label: string) {
    Haptics.selectionAsync();
    setLogSymptoms((prev) => prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.titleRow}>
          <Text style={[s.heading, { color: colors.foreground }]}>{t("cycleTitle")}</Text>
          <Pressable onPress={() => setShowLog(true)} style={[s.logBtn, { backgroundColor: colors.primary }]}>
            <Text style={[s.logBtnText, { color: colors.primaryForeground }]}>{t("logBtn")}</Text>
          </Pressable>
        </View>

        {loadingPhase ? (
          <View style={s.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <View style={[s.phaseCard, { backgroundColor: phaseColor + "22", borderColor: phaseColor + "55" }]}>
            <View style={s.phaseCardTop}>
              <View>
                <Text style={s.phaseEmoji}>{PHASE_EMOJI[phaseKey]}</Text>
                <Text style={[s.phaseLabel, { color: phaseColor }]}>
                  {t(`phase${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}` as "phaseMenstrual")}
                </Text>
                {phase?.dayInCycle != null && (
                  <Text style={[s.phaseDayText, { color: colors.mutedForeground }]}>
                    {t("phaseDay", { n: phase.dayInCycle })}
                  </Text>
                )}
              </View>
              {phase?.nextPeriodIn != null && (
                <View style={[s.nextPeriodBadge, { backgroundColor: phaseColor + "33" }]}>
                  <Text style={[s.nextPeriodLabel, { color: phaseColor }]}>{t("nextPeriodLabel")}</Text>
                  <Text style={[s.nextPeriodDays, { color: phaseColor }]}>{t("inDays", { n: phase.nextPeriodIn })}</Text>
                </View>
              )}
            </View>

            <Text style={[s.phaseDesc, { color: colors.foreground }]}>{t(phaseDescKey)}</Text>

            <View style={[s.energyBadge, { backgroundColor: phaseColor + "33" }]}>
              <Text style={[s.energyBadgeText, { color: phaseColor }]}>{t(energyKey)}</Text>
            </View>

            <View style={s.recSection}>
              <Text style={[s.recTitle, { color: colors.mutedForeground }]}>{t("recommendations")}</Text>
              {recKeys.map((rk, i) => (
                <View key={i} style={s.recRow}>
                  <View style={[s.recDot, { backgroundColor: phaseColor }]} />
                  <Text style={[s.recText, { color: colors.foreground }]}>{t(rk)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {entries && entries.length > 0 && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("recentEntries")}</Text>
            {entries.slice(0, 8).map((entry, i) => (
              <View
                key={entry.id ?? i}
                style={[s.entryRow, { borderBottomColor: colors.border, borderBottomWidth: i < Math.min(entries.length, 8) - 1 ? 1 : 0 }]}
              >
                <View style={[s.entryDot, { backgroundColor: PHASE_COLORS[entry.entryType ?? "unknown"] ?? colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.entryType, { color: colors.foreground }]}>
                    {ENTRY_TYPE_MAP[entry.entryType as CreateCycleEntryBodyEntryType] ?? entry.entryType}
                  </Text>
                  {entry.symptoms && (
                    <Text style={[s.entrySymptoms, { color: colors.mutedForeground }]} numberOfLines={1}>{entry.symptoms}</Text>
                  )}
                </View>
                <Text style={[s.entryDate, { color: colors.mutedForeground }]}>{formatEntryDate(entry.date)}</Text>
              </View>
            ))}
          </View>
        )}

        {loadingEntries && <View style={s.loading}><ActivityIndicator color={colors.primary} /></View>}
      </ScrollView>

      <Modal visible={showLog} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLog(false)}>
        <LogSheet
          logType={logType}
          symptoms={logSymptoms}
          entryTypes={ENTRY_TYPES}
          symptomItems={SYMPTOMS}
          onType={setLogType}
          onToggleSymptom={toggleSymptom}
          onSave={handleLog}
          onClose={() => setShowLog(false)}
          saving={createEntry.isPending}
          colors={colors}
          insets={insets}
          isWeb={isWeb}
          tTitle={t("logEntry")}
          tCancel={t("cancel")}
          tType={t("typeLabel")}
          tSymptoms={t("symptomsOptional")}
          tSave={t("saveEntry")}
        />
      </Modal>
    </View>
  );
}

function LogSheet({
  logType, symptoms, entryTypes, symptomItems,
  onType, onToggleSymptom, onSave, onClose, saving, colors, insets, isWeb,
  tTitle, tCancel, tType, tSymptoms, tSave,
}: {
  logType: CreateCycleEntryBodyEntryType;
  symptoms: string[];
  entryTypes: { value: CreateCycleEntryBodyEntryType; label: string }[];
  symptomItems: { key: string; label: string }[];
  onType: (v: CreateCycleEntryBodyEntryType) => void;
  onToggleSymptom: (s: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number; bottom: number };
  isWeb: boolean;
  tTitle: string; tCancel: string; tType: string; tSymptoms: string; tSave: string;
}) {
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  return (
    <View style={[ls.container, { backgroundColor: colors.background, paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
      <View style={[ls.topRow, { paddingHorizontal: 20 }]}>
        <Text style={[ls.title, { color: colors.foreground }]}>{tTitle}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[ls.cancel, { color: colors.mutedForeground }]}>{tCancel}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[ls.content, { paddingHorizontal: 20 }]} keyboardShouldPersistTaps="handled">
        <Text style={[ls.sectionLabel, { color: colors.mutedForeground }]}>{tType}</Text>
        <View style={ls.typeGrid}>
          {entryTypes.map((et) => (
            <Pressable
              key={et.value}
              onPress={() => { Haptics.selectionAsync(); onType(et.value); }}
              style={[ls.typeBtn, { backgroundColor: logType === et.value ? colors.primary : colors.card, borderColor: logType === et.value ? colors.primary : colors.border }]}
            >
              <Text style={[ls.typeBtnText, { color: logType === et.value ? colors.primaryForeground : colors.foreground }]}>{et.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[ls.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>{tSymptoms}</Text>
        <View style={ls.symptomGrid}>
          {symptomItems.map((sym) => (
            <Pressable
              key={sym.key}
              onPress={() => onToggleSymptom(sym.label)}
              style={[ls.symptomBtn, { backgroundColor: symptoms.includes(sym.label) ? colors.accent : colors.card, borderColor: symptoms.includes(sym.label) ? colors.primary : colors.border }]}
            >
              <Text style={[ls.symptomText, { color: symptoms.includes(sym.label) ? colors.primary : colors.foreground }]}>{sym.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[ls.footer, { paddingHorizontal: 20 }]}>
        <Pressable onPress={onSave} style={[ls.saveBtn, { backgroundColor: colors.primary }]} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[ls.saveBtnText, { color: colors.primaryForeground }]}>{tSave}</Text>}
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

const ls = StyleSheet.create({
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
