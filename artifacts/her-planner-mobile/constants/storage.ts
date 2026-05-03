export const STORAGE_KEYS = {
  language:           "her-planner-language",
  lunaConversation:   "luna-conversation-id",
  onboardingComplete: "her-planner-onboarding-complete",
  todaySymptoms: (isoDate: string) => `today-symptoms-${isoDate}`,
} as const;
