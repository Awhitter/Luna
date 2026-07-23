import {
  type Profile,
  type CycleEntry,
  type DailyContext,
  type Task,
} from "@workspace/db";
import { type AgentConfig } from "@workspace/db";

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

export interface BuildContextInput {
  agent: AgentConfig;
  profile?: Profile;
  lastPeriod?: CycleEntry;
  today?: DailyContext;
  pendingTasks: Task[];
  language?: string;
  symptoms?: string[];
  memories?: string[];
  conversationSummary?: string;
}

export function buildSystemContext(input: BuildContextInput): string {
  const {
    agent,
    profile,
    lastPeriod,
    today,
    pendingTasks,
    language = "es",
    symptoms,
    memories,
    conversationSummary,
  } = input;

  let ctx = `${agent.persona}\n\nCurrent context about her life:`;

  if (profile) {
    ctx += `\n- Name: ${profile.name}`;
    ctx += `\n- Has kids: ${profile.hasKids ? `Yes (${profile.numberOfKids || "??"} kid${(profile.numberOfKids ?? 0) > 1 ? "s" : ""})` : "No"}`;
    if (profile.workSchedule) ctx += `\n- Work schedule: ${profile.workSchedule}${profile.workHours ? `, ~${profile.workHours} hours/day` : ""}`;
    if (profile.healthConditions) ctx += `\n- Health: ${profile.healthConditions}`;
    if (profile.averageSleepHours) ctx += `\n- Typically sleeps: ${profile.averageSleepHours} hours`;
    if (profile.exercisePerWeek != null) ctx += `\n- Exercise: ${profile.exercisePerWeek}x/week${profile.exerciseIntensity ? ` (${profile.exerciseIntensity} intensity)` : ""}`;
    if (profile.contraception && profile.contraception !== "unknown") ctx += `\n- Contraception: ${profile.contraception} — factor this into cycle and symptom advice`;
    if (profile.hydration) ctx += `\n- Hydration habit: ${profile.hydration} — mention hydration tips when relevant`;
    if (profile.pendingLunaNote) {
      ctx += `\n\n⚡ RECENT PROFILE UPDATE (she just changed something important): ${profile.pendingLunaNote} Acknowledge this warmly and naturally early in your reply — like a caring friend who noticed. Don't read it like a list; weave it in naturally.`;
    }
  }

  if (lastPeriod) {
    const now = new Date();
    const periodStart = new Date(lastPeriod.date);
    const dayInCycle = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const cycleLen = profile?.cycleLength ?? 28;
    let phase = "unknown";
    if (dayInCycle <= (profile?.periodLength ?? 5)) phase = "menstrual";
    else if (dayInCycle <= 13) phase = "follicular";
    else if (dayInCycle <= 16) phase = "ovulation";
    else phase = "luteal";
    ctx += `\n- Cycle: Day ${dayInCycle} of ${cycleLen} (${phase} phase) — factor this into your energy and task suggestions`;
  }

  if (today) {
    if (today.sleepHours) ctx += `\n- Slept ${today.sleepHours} hours last night`;
    if (today.energyLevel) ctx += `\n- Energy today: ${today.energyLevel}/5`;
    if (today.mood) ctx += `\n- Mood: ${today.mood}`;
  }

  if (pendingTasks.length > 0) {
    ctx += `\n- Already on her list: ${pendingTasks.map((t) => t.title).join(", ")}`;
  }

  if (symptoms && symptoms.length > 0) {
    ctx += `\n- TODAY'S SYMPTOMS she logged: ${symptoms.join(", ")} — factor these into every suggestion. Acknowledge them naturally, suggest tasks and meals that are gentle on her body, avoid suggesting high-intensity activity.`;
  }

  if (memories && memories.length > 0) {
    ctx += `\n\nThings you remember from past conversations (use these to feel continuous, but only bring them up if relevant):`;
    for (const m of memories) ctx += `\n- ${m}`;
  }

  if (conversationSummary) {
    ctx += `\n\nSummary of earlier in this conversation (older messages were summarized to save tokens):\n${conversationSummary}`;
  }

  if (agent.rules) {
    ctx += `\n\n${agent.rules}`;
  }

  if (language && language !== "en") {
    const langName = LANGUAGE_NAMES[language] ?? "Spanish";
    ctx += `\n\nIMPORTANT: Always respond in ${langName}. Every response must be written entirely in ${langName}.`;
  }

  return ctx;
}

export function computeCyclePhaseSnippet(profile: Profile | undefined, lastPeriod: CycleEntry | undefined): string {
  if (!lastPeriod) return "";
  const now = new Date();
  const periodStart = new Date(lastPeriod.date);
  const dayInCycle = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const cycleLen = profile?.cycleLength ?? 28;
  let phase = "unknown";
  if (dayInCycle <= (profile?.periodLength ?? 5)) phase = "menstrual";
  else if (dayInCycle <= 13) phase = "follicular";
  else if (dayInCycle <= 16) phase = "ovulation";
  else phase = "luteal";
  return `Cycle: Day ${dayInCycle} of ${cycleLen} (${phase} phase)`;
}
