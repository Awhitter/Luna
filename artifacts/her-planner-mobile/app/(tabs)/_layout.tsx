import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useGetTodayContext } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";

function NativeTabLayout() {
  const { t } = useLanguage();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>{t("tabMe")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} />
        <Label>{t("tabToday")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="week">
        <Icon sf={{ default: "calendar", selected: "calendar" }} />
        <Label>{t("tabWeek")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="month">
        <Icon sf={{ default: "calendar.badge.clock", selected: "calendar.badge.clock" }} />
        <Label>{t("tabMonth")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cycle">
        <Icon sf={{ default: "moon.stars", selected: "moon.stars.fill" }} />
        <Label>{t("tabCycle")}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { t } = useLanguage();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { data: todayCtx, isLoading: ctxLoading } = useGetTodayContext();
  const showTodayBadge = !ctxLoading && !todayCtx;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "PlusJakartaSans_500Medium",
          fontSize: 11,
        },
      }}
      initialRouteName="index"
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabMe"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person" tintColor={color} size={24} /> : <Feather name="user" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabToday"),
          tabBarBadge: showTodayBadge ? " " : undefined,
          tabBarBadgeStyle: { minWidth: 10, height: 10, borderRadius: 5, fontSize: 1, lineHeight: 1 },
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="sun.max" tintColor={color} size={24} /> : <Feather name="sun" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="week"
        options={{
          title: t("tabWeek"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="calendar" tintColor={color} size={24} /> : <Feather name="calendar" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="month"
        options={{
          title: t("tabMonth"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="calendar.badge.clock" tintColor={color} size={24} /> : <Feather name="grid" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cycle"
        options={{
          title: t("tabCycle"),
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="moon.stars" tintColor={color} size={24} /> : <Feather name="moon" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
