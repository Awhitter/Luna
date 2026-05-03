import {
  useCreateProfile,
  useGetCheckinStreak,
  useGetProfile,
  useUpdateProfile,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { LangCode } from "@/constants/translations";

const LANGUAGES: { code: LangCode; label: string; flag: string }[] = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "es", label: "Español",    flag: "🇪🇸" },
  { code: "pt", label: "Português",  flag: "🇧🇷" },
];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const { t, language, setLanguage } = useLanguage();

  const { data: profile, isLoading } = useGetProfile();
  const { data: streak } = useGetCheckinStreak();
  const updateProfile = useUpdateProfile();
  const createProfile = useCreateProfile();

  const [name, setName] = useState("");
  const [hasKids, setHasKids] = useState(false);
  const [numberOfKids, setNumberOfKids] = useState(1);
  const [workSchedule, setWorkSchedule] = useState("full-time");
  const [healthConditions, setHealthConditions] = useState("");
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  const WORK_SCHEDULES = [
    { value: "full-time", label: t("wsFullTime") },
    { value: "part-time", label: t("wsPartTime") },
    { value: "flexible",  label: t("wsFlexible")  },
    { value: "remote",    label: t("wsRemote")    },
    { value: "none",      label: t("wsNone")      },
  ];

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true;
      setName(profile.name ?? "");
      setHasKids(profile.hasKids ?? false);
      setNumberOfKids(profile.numberOfKids ?? 1);
      setWorkSchedule(profile.workSchedule ?? "full-time");
      setHealthConditions(profile.healthConditions ?? "");
    }
  }, [profile]);

  async function handleLanguageSelect(code: LangCode) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setLanguage(code);
  }

  async function handleSave() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const profileData = {
      name: name.trim() || "Friend",
      hasKids,
      numberOfKids: hasKids ? numberOfKids : undefined,
      workSchedule,
      healthConditions: healthConditions.trim() || undefined,
    };
    try {
      if (profile) {
        await updateProfile.mutateAsync({ data: profileData });
      } else {
        await createProfile.mutateAsync({ data: profileData });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  const isSaving = updateProfile.isPending || createProfile.isPending;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[s.content, { paddingTop: topPad + 16, paddingBottom: bottomPad + 32 }]}
      bottomOffset={20}
    >
      <Text style={[s.heading, { color: colors.foreground }]}>{t("myProfile")}</Text>

      {/* Streak Badge */}
      {streak != null && (
        <View style={[s.streakCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.streakCardTitle, { color: colors.mutedForeground }]}>{t("streakTitle")}</Text>
          <View style={s.streakRow}>
            {/* Current streak — hero tile */}
            <View style={[s.streakHero, { backgroundColor: colors.primary + "18" }]}>
              <Text style={s.streakFire}>🔥</Text>
              <Text style={[s.streakHeroNum, { color: colors.primary }]}>{streak.currentStreak}</Text>
              <Text style={[s.streakHeroLabel, { color: colors.mutedForeground }]}>
                {streak.currentStreak === 1 ? t("streakDay", { n: "" }).replace("{n} ", "") : t("streakDays", { n: "" }).replace("{n} ", "")}
              </Text>
              <Text style={[s.streakHeroSub, { color: colors.primary }]}>
                {streak.currentStreak > 0 ? t("streakFire") : t("streakStart")}
              </Text>
            </View>
            {/* Stats column */}
            <View style={s.streakStats}>
              <View style={[s.streakStatRow, { borderColor: colors.border }]}>
                <Text style={s.streakStatEmoji}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.streakStatNum, { color: colors.foreground }]}>{streak.longestStreak}</Text>
                  <Text style={[s.streakStatLabel, { color: colors.mutedForeground }]}>{t("longestStreak")}</Text>
                </View>
              </View>
              <View style={s.streakStatRow}>
                <Text style={s.streakStatEmoji}>✅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.streakStatNum, { color: colors.foreground }]}>{streak.totalCheckins}</Text>
                  <Text style={[s.streakStatLabel, { color: colors.mutedForeground }]}>{t("totalCheckins")}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={s.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <>
          {/* Name */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t("yourName")}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("namePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          {/* Language */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t("lunaLanguage")}</Text>
            <Text style={[s.sublabel, { color: colors.mutedForeground }]}>{t("lunaLanguageSub")}</Text>
            <View style={s.langRow}>
              {LANGUAGES.map((lang) => {
                const selected = language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => handleLanguageSelect(lang.code)}
                    style={[
                      s.langBtn,
                      {
                        backgroundColor: selected ? colors.primary : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                        flex: 1,
                      },
                    ]}
                  >
                    <Text style={s.langFlag}>{lang.flag}</Text>
                    <Text style={[s.langLabel, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                      {lang.label}
                    </Text>
                    {selected && (
                      <Text style={[s.langCheck, { color: colors.primaryForeground }]}>✓</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Work schedule */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t("workSchedule")}</Text>
            <View style={s.chipRow}>
              {WORK_SCHEDULES.map((ws) => (
                <Pressable
                  key={ws.value}
                  onPress={() => { Haptics.selectionAsync(); setWorkSchedule(ws.value); }}
                  style={[s.chip, {
                    backgroundColor: workSchedule === ws.value ? colors.primary : colors.card,
                    borderColor: workSchedule === ws.value ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[s.chipText, { color: workSchedule === ws.value ? colors.primaryForeground : colors.foreground }]}>
                    {ws.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Kids */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t("doYouHaveKids")}</Text>
            <View style={s.toggleRow}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setHasKids(false); }}
                style={[s.toggleBtn, { backgroundColor: !hasKids ? colors.primary : colors.card, borderColor: !hasKids ? colors.primary : colors.border }]}
              >
                <Text style={[s.toggleText, { color: !hasKids ? colors.primaryForeground : colors.foreground }]}>{t("noKids")}</Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setHasKids(true); }}
                style={[s.toggleBtn, { backgroundColor: hasKids ? colors.primary : colors.card, borderColor: hasKids ? colors.primary : colors.border }]}
              >
                <Text style={[s.toggleText, { color: hasKids ? colors.primaryForeground : colors.foreground }]}>{t("yesKids")}</Text>
              </Pressable>
            </View>
            {hasKids && (
              <View style={s.kidsRow}>
                <Text style={[s.kidsLabel, { color: colors.mutedForeground }]}>{t("howMany")}</Text>
                <View style={s.kidsNums}>
                  {[1,2,3,4,5].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => { Haptics.selectionAsync(); setNumberOfKids(n); }}
                      style={[s.kidNum, { backgroundColor: numberOfKids === n ? colors.primary : colors.card, borderColor: numberOfKids === n ? colors.primary : colors.border }]}
                    >
                      <Text style={[s.kidNumText, { color: numberOfKids === n ? colors.primaryForeground : colors.foreground }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Health */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t("healthConditions")}</Text>
            <Text style={[s.sublabel, { color: colors.mutedForeground }]}>{t("healthSub")}</Text>
            <TextInput
              style={[s.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("healthPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={healthConditions}
              onChangeText={setHealthConditions}
              multiline
              numberOfLines={3}
            />
          </View>

          <Pressable
            onPress={handleSave}
            style={[s.saveBtn, { backgroundColor: saved ? colors.accent : colors.primary }]}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[s.saveBtnText, { color: saved ? colors.primary : colors.primaryForeground }]}>
                {saved ? t("savedProfile") : t("saveProfile")}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  heading: { fontSize: 28, fontFamily: "PlusJakartaSans_700Bold", marginBottom: 28 },
  loading: { paddingVertical: 40, alignItems: "center" },
  section: { marginBottom: 28 },
  label: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8, marginBottom: 10 },
  sublabel: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", marginBottom: 10, marginTop: -4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: "PlusJakartaSans_400Regular" },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", minHeight: 90, textAlignVertical: "top" },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  langFlag: { fontSize: 20 },
  langLabel: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  langCheck: { fontSize: 13, fontFamily: "PlusJakartaSans_700Bold" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  toggleText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  kidsRow: { marginTop: 14 },
  kidsLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", marginBottom: 10 },
  kidsNums: { flexDirection: "row", gap: 8 },
  kidNum: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  kidNumText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
  streakCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 28 },
  streakCardTitle: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14 },
  streakRow: { flexDirection: "row", gap: 12 },
  streakHero: { flex: 1, borderRadius: 16, padding: 14, alignItems: "center", justifyContent: "center" },
  streakFire: { fontSize: 28, marginBottom: 4 },
  streakHeroNum: { fontSize: 42, fontFamily: "PlusJakartaSans_700Bold", lineHeight: 46 },
  streakHeroLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", marginTop: 2 },
  streakHeroSub: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", marginTop: 6, textAlign: "center" },
  streakStats: { flex: 1, justifyContent: "space-between", gap: 10 },
  streakStatRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "transparent" },
  streakStatEmoji: { fontSize: 22 },
  streakStatNum: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  streakStatLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", marginTop: 1 },
});
