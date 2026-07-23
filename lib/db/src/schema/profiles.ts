import { pgTable, serial, text, boolean, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hasKids: boolean("has_kids").notNull().default(false),
  numberOfKids: integer("number_of_kids"),
  workSchedule: text("work_schedule"),
  workHours: integer("work_hours"),
  healthConditions: text("health_conditions"),
  averageSleepHours: real("average_sleep_hours"),
  cycleLength: integer("cycle_length"),
  periodLength: integer("period_length"),
  exercisePerWeek: integer("exercise_per_week"),
  exerciseIntensity: text("exercise_intensity"),
  contraception: text("contraception"),
  hydration: text("hydration"),
  pendingLunaNote: text("pending_luna_note"),
  /** JSON array of {name, age?, allergies?, notes?} — consented Conóceme data */
  kidsJson: text("kids_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true, updatedAt: true });
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
