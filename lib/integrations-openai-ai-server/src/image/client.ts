import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

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

function resolveBaseURL(): string | undefined {
  if (
    process.env.AI_GATEWAY_API_KEY !== undefined ||
    process.env.VERCEL_OIDC_TOKEN !== undefined
  ) {
    return "https://ai-gateway.vercel.sh/v1";
  }
  return (
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    undefined
  );
}

let cached: OpenAI | null = null;

function getClient(): OpenAI {
  if (!cached) {
    const baseURL = resolveBaseURL();
    cached = new OpenAI({
      apiKey: resolveApiKey(),
      ...(baseURL ? { baseURL } : {}),
    });
  }
  return cached;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await getClient().images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map(async (file) => {
      return await toFile(fs.createReadStream(file), file, {
        type: "image/png",
      });
    })
  );

  const response = await getClient().images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const base64 = response.data?.[0]?.b64_json ?? "";
  const buffer = Buffer.from(base64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, buffer);
  }

  return buffer;
}
