import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { conversations } from "./conversations";

export const agentMemories = pgTable("agent_memories", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  source: text("source").notNull().default("luna"),
  /** household | prefs | kids | recipes | taste | episodic | money_goals | health */
  category: text("category"),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agent_memories_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
]);

export const insertAgentMemorySchema = createInsertSchema(agentMemories).omit({ id: true, createdAt: true });
export type AgentMemory = typeof agentMemories.$inferSelect;
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
