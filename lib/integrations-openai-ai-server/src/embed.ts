import { openai } from "./client";

const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("embedText: input must not be empty");
  }
  const result = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  const vector = result.data[0]?.embedding;
  if (!vector) {
    throw new Error("embedText: no embedding returned");
  }
  return vector;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return [];
  const result = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleaned,
  });
  return result.data.map((d) => d.embedding);
}
