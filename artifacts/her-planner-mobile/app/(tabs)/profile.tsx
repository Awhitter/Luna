import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useCreateProfile,
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

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
];

const WORK_SCHEDULES = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "flexible", label: "Flexible" },
  { value: "remote", label: "Remote" },
  { value: "none", label: "Not working" },
];

const KID_COUNTS = [1, 2, 3, 4, 5];

const LANG_STORAGE_KEY = "her-planner-language";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const createProfile = useCreateProfile();

  const [name, setName] = useState("");
  const [hasKids, setHasKids] = useState(false);
  const [numberOfKids, setNumberOfKids] = useState(1);
  const [workSchedule, setWorkSchedule] = useState("full-time");
  const [healthConditions, setHealthConditions] = useState("");
  const [language, setLanguage] = useState("en");
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(LANG_STORAGE_KEY).then((val) => {
      if (val) setLanguage(val);
    });
  }, []);

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

  async function handleLanguageSelect(code: string) {
    Haptics.selectionAsync();
    setLanguage(code);
    await AsyncStorage.setItem(LANG_STORAGE_KEY, code);
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
      contentContainerStyle={[
        s.content,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 32 },
      ]}
      bottomOffset={20}
    >
      <Text style={[s.heading, { color: colors.foreground }]}>My Profile</Text>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          {/* Name */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>YOUR NAME</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="What should Luna call you?"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          {/* Language */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>LUNA'S LANGUAGE</Text>
            <Text style={[s.sublabel, { color: colors.mutedForeground }]}>
              Luna will respond in your chosen language
            </Text>
            <View style={s.langGrid}>
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
                      },
                    ]}
                  >
                    <Text style={s.langFlag}>{lang.flag}</Text>
                    <Text style={[s.langLabel, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                      {lang.label}
                    </Text>
                    {selected && (
                      <View style={[s.langCheck, { backgroundColor: colors.primaryForeground + "33" }]}>
                        <Text style={[s.langCheckTxt, { color: colors.primaryForeground }]}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Work schedule */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>WORK SCHEDULE</Text>
            <View style={s.chipRow}>
              {WORK_SCHEDULES.map((ws) => (
                <Pressable
                  key={ws.value}
                  onPress={() => { Haptics.selectionAsync(); setWorkSchedule(ws.value); }}
                  style={[
                    s.chip,
                    {
                      backgroundColor: workSchedule === ws.value ? colors.primary : colors.card,
                      borderColor: workSchedule === ws.value ? colors.primary : colors.border,
                    },
                  ]}
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
            <Text style={[s.label, { color: colors.mutedForeground }]}>DO YOU HAVE KIDS?</Text>
            <View style={s.toggleRow}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setHasKids(false); }}
                style={[s.toggleBtn, {
                  backgroundColor: !hasKids ? colors.primary : colors.card,
                  borderColor: !hasKids ? colors.primary : colors.border,
                }]}
              >
                <Text style={[s.toggleText, { color: !hasKids ? colors.primaryForeground : colors.foreground }]}>No</Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setHasKids(true); }}
                style={[s.toggleBtn, {
                  backgroundColor: hasKids ? colors.primary : colors.card,
                  borderColor: hasKids ? colors.primary : colors.border,
                }]}
              >
                <Text style={[s.toggleText, { color: hasKids ? colors.primaryForeground : colors.foreground }]}>Yes</Text>
              </Pressable>
            </View>

            {hasKids && (
              <View style={s.kidsRow}>
                <Text style={[s.kidsLabel, { color: colors.mutedForeground }]}>How many?</Text>
                <View style={s.kidsNums}>
                  {KID_COUNTS.map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => { Haptics.selectionAsync(); setNumberOfKids(n); }}
                      style={[s.kidNum, {
                        backgroundColor: numberOfKids === n ? colors.primary : colors.card,
                        borderColor: numberOfKids === n ? colors.primary : colors.border,
                      }]}
                    >
                      <Text style={[s.kidNumText, { color: numberOfKids === n ? colors.primaryForeground : colors.foreground }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Health conditions */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>HEALTH CONDITIONS</Text>
            <Text style={[s.sublabel, { color: colors.mutedForeground }]}>
              Helps Luna give better support (optional)
            </Text>
            <TextInput
              style={[s.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. PCOS, endometriosis, anxiety…"
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
                {saved ? "✓ Saved" : "Save Profile"}
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    minHeight: 90,
    textAlignVertical: "top",
  },
  langGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  langBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: "47%",
  },
  langFlag: { fontSize: 18 },
  langLabel: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  langCheck: { width: 20, height: 20, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  langCheckTxt: { fontSize: 11, fontFamily: "PlusJakartaSans_700Bold" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  toggleText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  kidsRow: { marginTop: 14 },
  kidsLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", marginBottom: 10 },
  kidsNums: { flexDirection: "row", gap: 8 },
  kidNum: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    justifyContent: "center", alignItems: "center",
  },
  kidNumText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
});
