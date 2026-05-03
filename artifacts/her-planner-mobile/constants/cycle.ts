export const PHASE_COLORS: Record<string, string> = {
  menstrual:  "#e07070",
  follicular: "#70b070",
  ovulation:  "#d4a843",
  luteal:     "#9b7fc4",
  unknown:    "#b0b0b0",
};

export const PHASE_EMOJI: Record<string, string> = {
  menstrual:  "🌑",
  follicular: "🌒",
  ovulation:  "🌕",
  luteal:     "🌖",
  unknown:    "🌙",
};

export const PHASE_KEYS = ["menstrual", "follicular", "ovulation", "luteal"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number] | "unknown";

export const SYMPTOM_KEYS = [
  "symCramps",
  "symHeadache",
  "symBloating",
  "symTenderBreasts",
  "symMoodSwings",
  "symFatigue",
  "symAcne",
  "symCravings",
] as const;
export type SymptomKey = (typeof SYMPTOM_KEYS)[number];
