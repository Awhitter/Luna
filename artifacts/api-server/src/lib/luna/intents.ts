import type { LunaTools } from "./tools";

export type IntentId = "find_ways" | "solve" | "make" | "listen" | "feel";

export type ToolPolicy = "all" | "none" | "journal";

export interface IntentDefinition {
  id: IntentId;
  /** Spanish-default stem shown in UI; fill goes in the blank */
  stems: { es: string; en: string; pt: string };
  toolPolicy: ToolPolicy;
  /** Extra system nudge for this intent */
  systemNudge: string;
}

export const INTENTS: IntentDefinition[] = [
  {
    id: "find_ways",
    stems: {
      es: "Encuentra formas de ___",
      en: "Find ways to ___",
      pt: "Encontre formas de ___",
    },
    toolPolicy: "all",
    systemNudge:
      "FIND WAYS: Offer at most 3 concrete options. Each option = one short line + why it fits TODAY's energy from AUTHORITATIVE (if logged). No essays, no hustle-bro tone. End with exactly one question asking which option to map next.",
  },
  {
    id: "solve",
    stems: {
      es: "Resuelve ___ por mí",
      en: "Solve ___ for me",
      pt: "Resolva ___ por mim",
    },
    toolPolicy: "all",
    systemNudge:
      "SOLVE: Give a clear decision path — at most 3 steps or options. Use tools when a task/symptom/memory helps. Keep under ~120 words. End with one question.",
  },
  {
    id: "make",
    stems: {
      es: "Ayúdame a crear ___",
      en: "Help me make ___",
      pt: "Me ajude a criar ___",
    },
    toolPolicy: "all",
    systemNudge:
      "MAKE: Deliver one ready-to-use draft or micro-plan (note, post, recipe outline, craft idea). Keep it short unless they ask for more. End with one question.",
  },
  {
    id: "listen",
    stems: {
      es: "¿Me escuchas sobre…?",
      en: "Will you hear me about…?",
      pt: "Você me escuta sobre…?",
    },
    toolPolicy: "none",
    systemNudge:
      "LISTENER MODE: Sit with them. No task lists, no productivity coaching, no 'here's what you should do' unless they explicitly ask. Warm presence only. Short. Tools are disabled — do not try to add tasks.",
  },
  {
    id: "feel",
    stems: {
      es: "Quiero sentirme ___",
      en: "I want to feel ___",
      pt: "Quero me sentir ___",
    },
    toolPolicy: "journal",
    systemNudge:
      "FEEL: Help them move toward that feeling with one gentle idea or micro-ritual. Journal lean: you may remember a meaningful preference. Do not pile on tasks unless they ask. End with one question.",
  },
];

export function getIntent(id: string | undefined | null): IntentDefinition | null {
  if (!id) return null;
  return INTENTS.find((i) => i.id === id) ?? null;
}

/** Server-enforced tool filter by intent policy */
export function toolsForIntent(
  allTools: LunaTools,
  intentId: string | undefined | null,
): LunaTools | undefined {
  const intent = getIntent(intentId);
  if (!intent || intent.toolPolicy === "all") return allTools;
  if (intent.toolPolicy === "none") return undefined;
  // journal: only rememberFact
  return {
    rememberFact: allTools.rememberFact,
  } as unknown as LunaTools;
}
