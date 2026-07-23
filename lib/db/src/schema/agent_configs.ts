import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentConfigs = pgTable("agent_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Luna"),
  persona: text("persona").notNull(),
  rules: text("rules"),
  model: text("model").notNull().default("gpt-4o"),
  temperature: real("temperature").notNull().default(0.8),
  maxTokens: integer("max_tokens").notNull().default(1024),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertAgentConfigSchema = createInsertSchema(agentConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type InsertAgentConfig = z.infer<typeof insertAgentConfigSchema>;
