import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { conversations } from "./conversations";

export const conversationSummaries = pgTable("conversation_summaries", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  messageCountAtSummary: integer("message_count_at_summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("conversation_summaries_conv_idx").on(t.conversationId),
]);

export const insertConversationSummarySchema = createInsertSchema(conversationSummaries).omit({ id: true, createdAt: true });
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type InsertConversationSummary = z.infer<typeof insertConversationSummarySchema>;
