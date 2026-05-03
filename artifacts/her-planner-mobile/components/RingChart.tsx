import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Circle, Svg } from "react-native-svg";

interface RingChartProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  bgColor: string;
  label: string;
  labelColor: string;
  mutedColor: string;
}

export function RingChart({
  completed,
  total,
  size = 76,
  strokeWidth = 7,
  color,
  bgColor,
  label,
  labelColor,
  mutedColor,
}: RingChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={s.wrapper}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={bgColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {total > 0 && (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFill, s.centerContent]}>
          <Text style={[s.countText, { color, fontSize: size * 0.23 }]}>
            {completed}
          </Text>
          <Text style={[s.totalText, { color: mutedColor, fontSize: size * 0.14 }]}>
            /{total}
          </Text>
        </View>
      </View>
      <Text style={[s.label, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 6 },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  countText: {
    fontFamily: "PlusJakartaSans_700Bold",
    lineHeight: undefined,
  },
  totalText: {
    fontFamily: "PlusJakartaSans_500Medium",
  },
  label: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
