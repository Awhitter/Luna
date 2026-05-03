import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cycleEntries = pgTable("cycle_entries", {
  id: serial("id").primaryKey(),
  entryType: text("entry_type").notNull(),
  date: text("date").notNull(),
  symptoms: text("symptoms"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCycleEntrySchema = createInsertSchema(cycleEntries).omit({ id: true, createdAt: true });
export type CycleEntry = typeof cycleEntries.$inferSelect;
export type InsertCycleEntry = z.infer<typeof insertCycleEntrySchema>;
