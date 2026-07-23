import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";

function resolveOpenAIApiKey(): string {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY ??
    process.env.VERCEL_OIDC_TOKEN ??
    process.env.OPENAI_API_KEY ??
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, OPENAI_API_KEY, or AI_INTEGRATIONS_OPENAI_API_KEY must be set",
    );
  }
  return apiKey;
}

function resolveOpenAIBaseURL(): string | undefined {
  if (
    process.env.AI_GATEWAY_API_KEY !== undefined ||
    process.env.VERCEL_OIDC_TOKEN !== undefined
  ) {
    return "https://ai-gateway.vercel.sh/v1";
  }
  return (
    process.env.OPENAI_BASE_URL ||
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    undefined
  );
}

let cachedOpenAI: ReturnType<typeof createOpenAI> | null = null;
let cachedXai: ReturnType<typeof createXai> | null = null;

function getOpenAIProvider() {
  if (!cachedOpenAI) {
    const apiKey = resolveOpenAIApiKey();
    const baseURL = resolveOpenAIBaseURL();
    cachedOpenAI = createOpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }
  return cachedOpenAI;
}

function getXaiProvider() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  if (!cachedXai) {
    cachedXai = createXai({ apiKey });
  }
  return cachedXai;
}

/**
 * Prefer Grok via Vercel AI Gateway (shared for all users), then direct XAI_API_KEY,
 * then OpenAI / agent-config model name.
 */
export function getModel(name?: string): LanguageModel {
  const viaGateway =
    process.env.AI_GATEWAY_API_KEY !== undefined ||
    process.env.VERCEL_OIDC_TOKEN !== undefined;

  if (viaGateway) {
    // Gateway model ids look like "xai/grok-4.5"
    const fromEnv = process.env.AI_MODEL?.trim();
    const fromAgent = name?.includes("/") ? name : undefined;
    return getOpenAIProvider()(fromEnv || fromAgent || "xai/grok-4.5");
  }

  const xai = getXaiProvider();
  if (xai) {
    return xai.chat("grok-4.5");
  }
  return getOpenAIProvider()(name ?? "gpt-4o");
}

export {
  getActiveAgentConfig,
  invalidateAgentConfigCache,
  DEFAULT_PERSONA,
  DEFAULT_RULES,
} from "./identity";
export {
  buildSystemContext,
  computeCyclePhaseSnippet,
  LANGUAGE_NAMES,
} from "./context";
export {
  recall,
  remember,
  summarize,
  maybeAutoSummarize,
  getMessagesForPrompt,
  getLatestSummary,
  SUMMARIZE_THRESHOLD,
} from "./memory";
export { buildLunaTools, type LunaTools, type ToolContext } from "./tools";
export {
  INTENTS,
  getIntent,
  toolsForIntent,
  type IntentId,
  type IntentDefinition,
} from "./intents";
