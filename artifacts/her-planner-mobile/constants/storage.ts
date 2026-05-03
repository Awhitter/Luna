export const STORAGE_KEYS = {
  language:          "her-planner-language",
  lunaConversation:  "luna-conversation-id",
  todaySymptoms: (isoDate: string) => `today-symptoms-${isoDate}`,
} as const;
