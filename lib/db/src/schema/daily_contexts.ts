import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyContexts = pgTable("daily_contexts", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  sleepHours: real("sleep_hours"),
  energyLevel: integer("energy_level"),
  mood: text("mood"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDailyContextSchema = createInsertSchema(dailyContexts).omit({ id: true, createdAt: true });
export type DailyContext = typeof dailyContexts.$inferSelect;
export type InsertDailyContext = z.infer<typeof insertDailyContextSchema>;
