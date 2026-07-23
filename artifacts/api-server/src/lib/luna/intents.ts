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
      "She asked you to find ways. Offer 3–5 concrete, realistic options. If the fill is about money, stay practical (skills she has, nap-window gigs) — no get-rich schemes.",
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
      "She wants a clear solve. Break it into small steps. Use tools when a task/symptom/memory helps; otherwise just decide with her.",
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
      "She wants something made (note, post, story, craft idea). Draft it ready to use; keep it short unless she asks for more.",
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
      "LISTENER MODE: Sit with her. No task lists, no productivity coaching, no 'here's what you should do' unless she explicitly asks. Warm presence only. Tools are disabled — do not try to add tasks.",
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
      "Help her move toward that feeling with gentle ideas. Journal lean: you may remember a meaningful preference, but do not pile on tasks unless she asks.",
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
