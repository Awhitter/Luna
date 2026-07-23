import { tool } from "ai";
import { z } from "zod";
import { db, tasks as tasksTable, cycleEntries } from "@workspace/db";
import { remember } from "./memory";

export interface ToolContext {
  conversationId?: number;
}

export function buildLunaTools(ctx: ToolContext) {
  return {
    addTask: tool({
      description:
        "Add a new task to the user's planner. Call this immediately after the user has confirmed a task and (when relevant) given a time. Include the time in the title if provided, e.g. 'Doctor call (2:00 PM)'.",
      inputSchema: z.object({
        title: z.string().min(1).describe("Short task title; include time in parens if specified."),
        category: z
          .enum(["work", "home", "health", "kids", "self-care", "food", "personal"])
          .describe("Category for the task."),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        view: z
          .enum(["today", "week", "month"])
          .default("today")
          .describe("Which list this belongs to. Default 'today'."),
      }),
      execute: async ({ title, category, priority, view }) => {
        const inserted = await db
          .insert(tasksTable)
          .values({
            title,
            category,
            priority,
            view,
            aiSuggested: true,
          })
          .returning({ id: tasksTable.id, title: tasksTable.title, view: tasksTable.view });
        return inserted[0] ?? { id: null, title, view };
      },
    }),

    proposeSymptoms: tool({
      description:
        "Propose 1–4 short symptom labels (extracted from what the user just said) for the user to add with one tap. Do NOT pass long sentences — only short concise labels like 'tired', 'sad', 'bloated', 'low motivation'. The mobile app renders these as a button; do not also describe the JSON.",
      inputSchema: z.object({
        symptoms: z
          .array(z.string().min(1).max(40))
          .min(1)
          .max(4)
          .describe("Short symptom labels, lowercase."),
      }),
      execute: async ({ symptoms }) => {
        const cleaned = Array.from(
          new Set(symptoms.map((s) => s.trim().toLowerCase()).filter(Boolean)),
        ).slice(0, 4);
        return { symptoms: cleaned };
      },
    }),

    logCycleEntry: tool({
      description:
        "Log a cycle entry the user explicitly mentioned (period start/end, ovulation, or a cycle-related note). Only call this when the user clearly tells you the event happened — never speculate.",
      inputSchema: z.object({
        entryType: z.enum(["period_start", "period_end", "ovulation", "symptom", "note"]),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("ISO date YYYY-MM-DD. Use today's date unless the user said otherwise."),
        symptoms: z.string().nullish(),
        notes: z.string().nullish(),
      }),
      execute: async ({ entryType, date, symptoms, notes }) => {
        const inserted = await db
          .insert(cycleEntries)
          .values({
            entryType,
            date,
            symptoms: symptoms ?? null,
            notes: notes ?? null,
          })
          .returning({ id: cycleEntries.id });
        return { id: inserted[0]?.id ?? null, entryType, date };
      },
    }),

    rememberFact: tool({
      description:
        "Save a short third-person fact about the user that you should remember across future chats (e.g. 'Her partner Mark started a new job last week and it's been stressful'). Use this for life events, recurring stressors, named people, preferences. Do NOT use it for one-off feelings or tasks. Keep facts under 200 characters.",
      inputSchema: z.object({
        fact: z.string().min(4).max(280).describe("Concise third-person fact."),
      }),
      execute: async ({ fact }) => {
        const result = await remember(fact, ctx.conversationId);
        return { saved: !!result, id: result?.id ?? null };
      },
    }),
  };
}

export type LunaTools = ReturnType<typeof buildLunaTools>;
