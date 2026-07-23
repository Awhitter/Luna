import {
  db,
  agentMemories,
  conversationSummaries,
  messages as messagesTable,
} from "@workspace/db";
import { embedText } from "@workspace/integrations-openai-ai-server";
import { eq, desc, sql, lt } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { generateText } from "ai";
import { getModel } from "./index";

const RECALL_DEFAULT_K = 5;
const RECALL_MAX_DISTANCE = 0.45;
export const SUMMARIZE_THRESHOLD = 30;
export const KEEP_RECENT_MESSAGES = 10;

export async function recall(
  query: string,
  topK: number = RECALL_DEFAULT_K,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  let queryVector: number[];
  try {
    queryVector = await embedText(trimmed);
  } catch {
    return [];
  }

  const distance = cosineDistance(agentMemories.embedding, queryVector);
  const rows = await db
    .select({ content: agentMemories.content })
    .from(agentMemories)
    .where(lt(distance, RECALL_MAX_DISTANCE))
    .orderBy(distance)
    .limit(topK);

  return rows.map((r) => r.content);
}

export async function remember(
  fact: string,
  conversationId?: number,
): Promise<{ id: number } | null> {
  const trimmed = fact.trim();
  if (!trimmed) return null;
  let vec: number[];
  try {
    vec = await embedText(trimmed);
  } catch {
    return null;
  }

  const inserted = await db
    .insert(agentMemories)
    .values({
      content: trimmed,
      embedding: vec,
      conversationId: conversationId ?? null,
      source: "luna",
    })
    .returning({ id: agentMemories.id });

  return inserted[0] ?? null;
}

export async function getLatestSummary(
  conversationId: number,
): Promise<{ summary: string; messageCountAtSummary: number } | null> {
  const rows = await db
    .select({
      summary: conversationSummaries.summary,
      messageCountAtSummary: conversationSummaries.messageCountAtSummary,
    })
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(desc(conversationSummaries.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Summarize a conversation: collapses all messages older than the most recent
 * KEEP_RECENT_MESSAGES into a single summary row, then incorporates the
 * previous summary so the chain stays compact.
 */
export async function summarize(conversationId: number): Promise<void> {
  const allMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt);

  if (allMessages.length < SUMMARIZE_THRESHOLD) return;

  const previous = await getLatestSummary(conversationId);
  const olderMessages = allMessages.slice(0, allMessages.length - KEEP_RECENT_MESSAGES);
  if (olderMessages.length === 0) return;

  const transcript = olderMessages
    .map((m) => `${m.role === "user" ? "Her" : "Luna"}: ${m.content}`)
    .join("\n");

  const prompt = `${previous ? `Previous summary:\n${previous.summary}\n\n` : ""}New messages to fold into the summary:\n${transcript}\n\nWrite a concise running summary of everything important so far — names, decisions, recurring themes, things to remember. 6-10 sentences. No bullet points.`;

  const { text } = await generateText({
    model: getModel("gpt-4o-mini"),
    maxOutputTokens: 400,
    system: "You write concise factual summaries of personal chat conversations.",
    prompt,
  });

  const summary = text.trim();
  if (!summary) return;

  await db.insert(conversationSummaries).values({
    conversationId,
    summary,
    messageCountAtSummary: allMessages.length,
  });
}

export async function maybeAutoSummarize(conversationId: number): Promise<void> {
  const countRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId));
  const count = countRows[0]?.c ?? 0;
  if (count < SUMMARIZE_THRESHOLD) return;

  const latest = await getLatestSummary(conversationId);
  if (latest && count - latest.messageCountAtSummary < SUMMARIZE_THRESHOLD) return;

  try {
    await summarize(conversationId);
  } catch {
    // non-critical
  }
}

/**
 * Returns recent messages that should be sent to the model: if a summary
 * exists, only messages newer than the summary checkpoint; otherwise all.
 */
export async function getMessagesForPrompt(
  conversationId: number,
): Promise<{
  recent: Array<{ role: string; content: string }>;
  summary: string | null;
}> {
  const latest = await getLatestSummary(conversationId);
  const all = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt);

  if (!latest) {
    return { recent: all.map((m) => ({ role: m.role, content: m.content })), summary: null };
  }

  const recent = all
    .slice(latest.messageCountAtSummary - KEEP_RECENT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
  return { recent, summary: latest.summary };
}
