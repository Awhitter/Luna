import OpenAI from "openai";

function resolveApiKey(): string {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY ??
    process.env.VERCEL_OIDC_TOKEN ??
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, AI_INTEGRATIONS_OPENAI_API_KEY, or OPENAI_API_KEY must be set.",
    );
  }

  return apiKey;
}

function shouldUseAiGateway(): boolean {
  return (
    process.env.AI_GATEWAY_API_KEY !== undefined ||
    process.env.VERCEL_OIDC_TOKEN !== undefined
  );
}

function createOpenaiClient(): OpenAI {
  const baseURL = shouldUseAiGateway()
    ? "https://ai-gateway.vercel.sh/v1"
    : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  return new OpenAI({
    apiKey: resolveApiKey(),
    ...(baseURL ? { baseURL } : {}),
  });
}

let cachedOpenai: OpenAI | null = null;

function getOpenaiClient(): OpenAI {
  cachedOpenai ??= createOpenaiClient();
  return cachedOpenai;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getOpenaiClient(), prop, receiver);
  },
});

export const defaultChatModel =
  process.env.AI_MODEL ??
  (shouldUseAiGateway() ? "openai/gpt-4o" : "gpt-4o");
