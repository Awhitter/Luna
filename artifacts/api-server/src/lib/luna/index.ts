import { createOpenAI } from "@ai-sdk/openai";
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

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;

function getOpenAIProvider() {
  if (!cachedProvider) {
    const apiKey = resolveOpenAIApiKey();
    const baseURL = resolveOpenAIBaseURL();
    cachedProvider = createOpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }
  return cachedProvider;
}

/**
 * The single place to swap providers. Later: xai.chat("grok-4.5") when XAI_API_KEY is set.
 */
export function getModel(name?: string): LanguageModel {
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
