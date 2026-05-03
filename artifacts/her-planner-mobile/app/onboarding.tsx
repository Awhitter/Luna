import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useCreateCycleEntry,
  useCreateProfile,
  useGetProfile,
  useUpdateProfile,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { STORAGE_KEYS } from "@/constants/storage";

const TOTAL_STEPS = 3;

const PERIOD_OPTIONS = [
  { label: "onbToday",     daysAgo: 0  },
  { label: "onbYesterday", daysAgo: 1  },
  { daysAgo: 2  },
  { daysAgo: 3  },
  { daysAgo: 4  },
  { daysAgo: 5  },
  { daysAgo: 6  },
  { daysAgo: 7  },
  { label: "onbNotSure",   daysAgo: -1 },
];

const CYCLE_LENGTHS  = [21, 24, 25, 26, 27, 28, 29, 30, 32, 35, 40];
const PERIOD_LENGTHS = [2, 3, 4, 5, 6, 7, 8];

export default function OnboardingScreen() {
  const colors    = useColors();
  const { t }     = useLanguage();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const isWeb     = Platform.OS === "web";
  const topPad    = isWeb ? 60 : insets.top + 16;
  const bottomPad = isWeb ? 40 : insets.bottom + 20;

  const [step,         setStep]         = useState(0);
  const [name,         setName]         = useState("");
  const [periodDaysAgo, setPeriodDaysAgo] = useState<number | null>(null);
  const [cycleLength,  setCycleLength]  = useState(28);
  const [periodLength, setPeriodLength] = useState(5);
  const [saving,       setSaving]       = useState(false);

  const fadeAnim      = useRef(new Animated.Value(1)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;

  const createProfile  = useCreateProfile();
  const updateProfile  = useUpdateProfile();
  const createCycleEntry = useCreateCycleEntry();
  const { data: existingProfile } = useGetProfile();

  function animateToStep(next: number) {
    const direction = next > step ? 40 : -40;
    Animated.parallel([
      Animated.timing(fadeAnim,      { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(translateAnim, { toValue: -direction, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      translateAnim.setValue(direction);
      Animated.parallel([
        Animated.timing(fadeAnim,      { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }

  function handleNext() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    animateToStep(step + 1);
  }

  async function handleFinish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    try {
      const profileData = {
        name: name.trim() || "Friend",
        cycleLength,
        periodLength,
        hasKids:      existingProfile?.hasKids      ?? false,
        workSchedule: existingProfile?.workSchedule ?? "full-time",
        healthConditions: existingProfile?.healthConditions ?? undefined,
      };

      if (existingProfile) {
        await updateProfile.mutateAsync({ data: profileData });
      } else {
        await createProfile.mutateAsync({ data: profileData });
      }

      if (periodDaysAgo !== null && periodDaysAgo >= 0) {
        const d = new Date();
        d.setDate(d.getDate() - periodDaysAgo);
        await createCycleEntry.mutateAsync({
          data: { entryType: "period_start", date: d.toISOString().split("T")[0] },
        });
      }

      await AsyncStorage.setItem(STORAGE_KEYS.onboardingComplete, "true");
      router.replace("/(tabs)");
    } catch {
      setSaving(false);
    }
  }

  const canNext0 = name.trim().length > 0;
  const canNext1 = periodDaysAgo !== null;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: topPad, paddingBottom: bottomPad }]}>

        {/* Progress dots */}
        <View style={s.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                {
                  backgroundColor: i <= step ? colors.primary : colors.border,
                  width: i === step ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Text style={[s.stepLabel, { color: colors.mutedForeground }]}>
          {t("onbStep", { n: String(step + 1) })}
        </Text>

        {/* Animated step content */}
        <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateX: translateAnim }] }]}>

          {/* ── Step 0: Welcome + Name ── */}
          {step === 0 && (
            <View style={s.stepWrap}>
              <Text style={s.lunaEmoji}>🌙</Text>
              <Text style={[s.title, { color: colors.foreground }]}>{t("onbWelcome")}</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{t("onbSubtitle")}</Text>

              <View style={[s.divider, { backgroundColor: colors.border }]} />

              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("onbNameTitle")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder={t("onbNameHint")}
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => canNext0 && handleNext()}
              />
            </View>
          )}

          {/* ── Step 1: Last period date ── */}
          {step === 1 && (
            <View style={s.stepWrap}>
              <Text style={s.lunaEmoji}>🩸</Text>
              <Text style={[s.title, { color: colors.foreground }]}>{t("onbPeriodTitle")}</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{t("onbPeriodSub")}</Text>

              <View style={s.chipsWrap}>
                {PERIOD_OPTIONS.map((opt) => {
                  const label = opt.label
                    ? t(opt.label)
                    : t("onbDaysAgo", { n: String(opt.daysAgo) });
                  const selected = periodDaysAgo === opt.daysAgo;
                  return (
                    <Pressable
                      key={opt.daysAgo}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPeriodDaysAgo(opt.daysAgo);
                      }}
                      style={[
                        s.chip,
                        {
                          backgroundColor: selected ? colors.primary : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[s.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Step 2: Cycle settings ── */}
          {step === 2 && (
            <View style={s.stepWrap}>
              <Text style={s.lunaEmoji}>🌸</Text>
              <Text style={[s.title, { color: colors.foreground }]}>{t("onbCycleTitle")}</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{t("onbCycleSub")}</Text>

              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("cycleLengthLabel")}</Text>
              <View style={s.chipsWrap}>
                {CYCLE_LENGTHS.map((n) => {
                  const selected = cycleLength === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => { Haptics.selectionAsync(); setCycleLength(n); }}
                      style={[s.chip, {
                        backgroundColor: selected ? colors.primary : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                      }]}
                    >
                      <Text style={[s.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 24 }]}>{t("periodLengthLabel")}</Text>
              <View style={s.chipsWrap}>
                {PERIOD_LENGTHS.map((n) => {
                  const selected = periodLength === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => { Haptics.selectionAsync(); setPeriodLength(n); }}
                      style={[s.chip, {
                        backgroundColor: selected ? colors.primary : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                      }]}
                    >
                      <Text style={[s.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

        </Animated.View>

        {/* CTA button */}
        <View style={s.footer}>
          {step < 2 ? (
            <Pressable
              onPress={handleNext}
              disabled={step === 0 ? !canNext0 : !canNext1}
              style={[
                s.btn,
                {
                  backgroundColor: (step === 0 ? canNext0 : canNext1) ? colors.primary : colors.border,
                  opacity: (step === 0 ? canNext0 : canNext1) ? 1 : 0.5,
                },
              ]}
            >
              <Text style={[s.btnText, { color: colors.primaryForeground }]}>{t("onbNext")}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleFinish}
              disabled={saving}
              style={[s.btn, { backgroundColor: colors.primary }]}
            >
              {saving ? (
                <View style={s.savingRow}>
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                  <Text style={[s.btnText, { color: colors.primaryForeground, marginLeft: 10 }]}>{t("onbSaving")}</Text>
                </View>
              ) : (
                <Text style={[s.btnText, { color: colors.primaryForeground }]}>{t("onbFinish")}</Text>
              )}
            </Pressable>
          )}

          {step > 0 && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); animateToStep(step - 1); }}
              style={s.backBtn}
            >
              <Text style={[s.backText, { color: colors.mutedForeground }]}>← Back</Text>
            </Pressable>
          )}
        </View>

      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, paddingHorizontal: 28 },
  dotsRow:     { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  dot:         { height: 8, borderRadius: 4 },
  stepLabel:   { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", marginBottom: 28 },
  content:     { flex: 1 },
  stepWrap:    { flex: 1 },
  lunaEmoji:   { fontSize: 48, marginBottom: 16 },
  title:       { fontSize: 26, fontFamily: "PlusJakartaSans_700Bold", marginBottom: 10, lineHeight: 32 },
  subtitle:    { fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", lineHeight: 22, marginBottom: 8 },
  divider:     { height: 1, marginVertical: 24 },
  fieldLabel:  { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8, marginBottom: 12 },
  input:       { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 18, fontFamily: "PlusJakartaSans_400Regular" },
  chipsWrap:   { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip:        { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 100, borderWidth: 1 },
  chipText:    { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  footer:      { paddingTop: 16, gap: 12 },
  btn:         { paddingVertical: 17, borderRadius: 16, alignItems: "center" },
  btnText:     { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold" },
  savingRow:   { flexDirection: "row", alignItems: "center" },
  backBtn:     { alignItems: "center", paddingVertical: 8 },
  backText:    { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
});
