import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db, conversations, messages, profiles, cycleEntries, dailyContexts, tasks } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { generateObject, streamText, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import {
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
} from "@workspace/api-zod";

import {
  getModel,
  getActiveAgentConfig,
  buildSystemContext,
  computeCyclePhaseSnippet,
  LANGUAGE_NAMES,
  recall,
  getMessagesForPrompt,
  maybeAutoSummarize,
  buildLunaTools,
} from "../lib/luna";

const router = Router();

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
});

// ─── Conversation CRUD ────────────────────────────────────────────────

router.get("/openai/conversations", async (req, res) => {
  try {
    const result = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/conversations", async (req, res) => {
  try {
    const parsed = CreateOpenaiConversationBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const result = await db.insert(conversations).values({ title: parsed.data.title }).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/openai/conversations/:id", async (req, res) => {
  try {
    const parsed = GetOpenaiConversationParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const conv = await db.select().from(conversations).where(eq(conversations.id, parsed.data.id));
    if (conv.length === 0) return res.status(404).json({ error: "Conversation not found" });
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, parsed.data.id)).orderBy(messages.createdAt);
    return res.json({ ...conv[0], messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/openai/conversations/:id", async (req, res) => {
  try {
    const parsed = DeleteOpenaiConversationParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const result = await db.delete(conversations).where(eq(conversations.id, parsed.data.id)).returning();
    if (result.length === 0) return res.status(404).json({ error: "Conversation not found" });
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const parsed = ListOpenaiMessagesParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const result = await db.select().from(messages).where(eq(messages.conversationId, parsed.data.id)).orderBy(messages.createdAt);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────

const SendMessageBody = z.object({
  content: z.string().min(1),
  language: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
});

async function loadLunaContext(language: string, extraSymptoms?: string[]) {
  const [agent, profileRows, cycleRows, todayRows, taskRows] = await Promise.all([
    getActiveAgentConfig(),
    db.select().from(profiles).limit(1),
    db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(5),
    db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(1),
    db.select().from(tasks).limit(20),
  ]);
  const profile = profileRows[0];
  const today = todayRows[0];
  const lastPeriod = cycleRows.find((e) => e.entryType === "period_start");
  const pendingTasks = taskRows.filter((t) => !t.completed).slice(0, 8);
  const symptoms = extraSymptoms && extraSymptoms.length > 0 ? extraSymptoms : undefined;
  return { agent, profile, today, lastPeriod, pendingTasks, language, symptoms };
}

// ─── Streaming chat ───────────────────────────────────────────────────

router.post("/openai/conversations/:id/messages", aiRateLimit, async (req, res) => {
  try {
    const idParsed = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
    if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

    const parsed = SendMessageBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const convId = idParsed.data.id;
    const { content, language = "en", symptoms } = parsed.data;

    const conv = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (conv.length === 0) return res.status(404).json({ error: "Conversation not found" });

    await db.insert(messages).values({ conversationId: convId, role: "user", content });

    const ctx = await loadLunaContext(language, symptoms);
    const memories = await recall(content, 5);
    const { recent, summary } = await getMessagesForPrompt(convId);

    const systemContext = buildSystemContext({
      ...ctx,
      memories,
      conversationSummary: summary ?? undefined,
    });

    const modelMessages: ModelMessage[] = recent
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const tools = buildLunaTools({ conversationId: convId });

    const result = streamText({
      model: getModel(ctx.agent.model),
      system: systemContext,
      messages: modelMessages,
      tools,
      toolChoice: "auto",
      temperature: ctx.agent.temperature,
      maxOutputTokens: ctx.agent.maxTokens,
      stopWhen: stepCountIs(5),
      onFinish: async ({ text }) => {
        try {
          if (text && text.trim()) {
            await db.insert(messages).values({
              conversationId: convId,
              role: "assistant",
              content: text,
            });
          }
          await maybeAutoSummarize(convId);
        } catch (err) {
          req.log.error({ err }, "Failed to persist assistant message / summarize");
        }
      },
    });

    result.pipeUIMessageStreamToResponse(res);
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) return res.status(500).json({ error: "Internal server error" });
    res.end();
    return;
  }
});

// ─── JSON one-shot endpoints ──────────────────────────────────────────

router.post("/openai/checkin-message", aiRateLimit, async (req, res) => {
  try {
    const { sleepHours, energyLevel, mood, language = "en", conversationId: convId } = req.body as {
      sleepHours?: number;
      energyLevel?: number;
      mood?: string;
      language?: string;
      conversationId?: number;
    };

    const ctx = await loadLunaContext(language);
    const cycleContext = computeCyclePhaseSnippet(ctx.profile, ctx.lastPeriod);
    const langName = LANGUAGE_NAMES[language] ?? "English";
    const name = ctx.profile?.name ?? "there";

    const checkinSummary = [
      sleepHours ? `Sleep: ${sleepHours} hours last night` : null,
      energyLevel ? `Energy: ${energyLevel}/10` : null,
      mood ? `Mood: ${mood}` : null,
      cycleContext || null,
      ctx.pendingTasks.length > 0 ? `Already on her list: ${ctx.pendingTasks.map((t) => t.title).join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const { object } = await generateObject({
      model: getModel(ctx.agent.model),
      schema: z.object({ message: z.string() }),
      system: `You are Luna, a warm AI best friend assistant. Always respond in ${langName}.`,
      prompt: `${name} just completed her morning check-in. Here's what she shared:
${checkinSummary || "No data logged"}

Write a warm, personal message FROM Luna (her AI best friend) that:
1. Briefly acknowledges what she logged — mention sleep, energy, and mood naturally, like a best friend would
2. Adds a relevant insight (e.g. if energy is low, validate it; if it's high, celebrate it; reference her cycle phase if known)
3. Ends by warmly asking what she wants to add to her to-do list today

Keep it to 3-4 sentences max. Genuine and warm, never generic. Write entirely in ${langName}.`,
      maxOutputTokens: 300,
    });

    const lunaMessage = object.message;
    if (convId) {
      try {
        await db.insert(messages).values({ conversationId: convId, role: "assistant", content: lunaMessage });
      } catch { /* non-critical */ }
    }
    return res.json({ message: lunaMessage });
  } catch (err) {
    req.log.error({ err }, "Failed to generate checkin message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/suggest-tasks", aiRateLimit, async (req, res) => {
  try {
    const language = (req.body?.language as string) || "en";
    const ctx = await loadLunaContext(language);
    const memories = await recall("today's plan and how she usually likes to spend her days", 5);
    const systemContext = buildSystemContext({ ...ctx, memories });
    const langName = LANGUAGE_NAMES[language] ?? "English";

    const SuggestionSchema = z.object({
      message: z.string(),
      suggestions: z
        .array(
          z.object({
            title: z.string(),
            category: z.enum(["work", "home", "health", "kids", "self-care", "food", "personal"]),
            priority: z.enum(["low", "medium", "high"]),
            reason: z.string(),
          }),
        )
        .max(3),
    });

    const { object } = await generateObject({
      model: getModel(ctx.agent.model),
      schema: SuggestionSchema,
      system: systemContext,
      prompt: `Based on everything you know about her right now — her energy (${ctx.today?.energyLevel ?? "??"}/5), mood (${ctx.today?.mood ?? "unknown"}), sleep (${ctx.today?.sleepHours ?? "??"}h), her cycle phase, her life — suggest exactly 3 tasks she should do today.

These must feel personally chosen for her, not generic.

Write the "message" and "reason" fields entirely in ${langName}.`,
      maxOutputTokens: 512,
    });

    return res.json({
      message: object.message,
      suggestions: object.suggestions.slice(0, 3),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate task suggestions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/profile-greeting", aiRateLimit, async (req, res) => {
  try {
    const { language = "en", conversationId: convId, planWithLuna = false } = req.body as {
      language?: string;
      conversationId?: number;
      planWithLuna?: boolean;
    };

    const ctx = await loadLunaContext(language);
    const langName = LANGUAGE_NAMES[language] ?? "English";
    const name = ctx.profile?.name ?? "there";
    const todayISO = new Date().toISOString().split("T")[0];
    const hasCheckin = ctx.today?.date === todayISO;
    const cycleContext = computeCyclePhaseSnippet(ctx.profile, ctx.lastPeriod);

    const profileBits = [
      ctx.profile?.contraception && ctx.profile.contraception !== "unknown" ? `using ${ctx.profile.contraception} as contraception` : null,
      ctx.profile?.exercisePerWeek != null ? `exercises ${ctx.profile.exercisePerWeek}x/week` : null,
      ctx.profile?.hydration ? `hydration: ${ctx.profile.hydration}` : null,
      ctx.profile?.hasKids ? `has ${ctx.profile.numberOfKids || ""} kid(s)` : null,
    ].filter(Boolean).join(", ");

    const checkinBits = hasCheckin ? [
      ctx.today?.mood ? `mood: ${ctx.today.mood}` : null,
      ctx.today?.energyLevel ? `energy: ${ctx.today.energyLevel}/5` : null,
      ctx.today?.sleepHours ? `slept ${ctx.today.sleepHours}h` : null,
    ].filter(Boolean).join(", ") : null;

    const memories = await recall(`${name} opening chat with luna`, 4);
    const memoryBits = memories.length ? `\n\nThings you remember about her: ${memories.join("; ")}` : "";

    const hasPendingNote = !!ctx.profile?.pendingLunaNote;
    let promptInstruction = "";
    if (hasPendingNote) {
      promptInstruction = `She just opened her chat. She recently updated her profile: ${ctx.profile!.pendingLunaNote} ${checkinBits ? `She also checked in today: ${checkinBits}.` : ""} ${cycleContext}. Open with a warm, natural message that gently acknowledges the change she made — be curious and supportive. Don't list it robotically. Make it feel like you genuinely noticed and care. 2-3 sentences.`;
    } else if (planWithLuna) {
      promptInstruction = hasCheckin
        ? `She just tapped "Plan with Luna" after checking in (${checkinBits}). ${cycleContext}. ${profileBits ? `About her: ${profileBits}.` : ""} Start with a warm, brief acknowledgment of her check-in data, then enthusiastically invite her to build her day together. 2-3 sentences.`
        : `She just tapped "Plan with Luna" but hasn't checked in today. ${cycleContext}. Start warm, gently notice she hasn't checked in yet, ask how she's doing today (energy, mood), and say you want to help plan her day. 2-3 sentences.`;
    } else {
      promptInstruction = `She just opened her chat with you. ${checkinBits ? `She checked in today: ${checkinBits}.` : "She hasn't checked in today."} ${cycleContext}. ${profileBits ? `About her: ${profileBits}.` : ""} Give a warm, personal greeting that references something specific you know about her (her cycle phase, how she's feeling today, or a personal detail). Invite her to share what's on her mind. 2-3 sentences max.`;
    }

    const { object } = await generateObject({
      model: getModel(ctx.agent.model),
      schema: z.object({ message: z.string() }),
      system: `You are Luna, ${name}'s warm AI best friend. Always respond in ${langName}.${memoryBits}`,
      prompt: `${promptInstruction}\n\nWrite entirely in ${langName}.`,
      maxOutputTokens: 220,
    });

    const lunaMessage = object.message;

    if (convId) {
      try {
        await db.insert(messages).values({ conversationId: convId, role: "assistant", content: lunaMessage });
      } catch { /* non-critical */ }
    }

    if (hasPendingNote && ctx.profile?.id) {
      try {
        await db.update(profiles).set({ pendingLunaNote: null }).where(eq(profiles.id, ctx.profile.id));
      } catch { /* non-critical */ }
    }

    return res.json({ message: lunaMessage });
  } catch (err) {
    req.log.error({ err }, "Failed to generate profile greeting");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/weekly-recap", aiRateLimit, async (req, res) => {
  try {
    const language = (req.body?.language as string) || "en";

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const startDate = sevenDaysAgo.toISOString().split("T")[0]!;

    const [weekContexts, weekTasks] = await Promise.all([
      db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(7),
      db.select().from(tasks).limit(30),
    ]);

    const ctx = await loadLunaContext(language);
    const recentContexts = weekContexts.filter((c) => c.date >= startDate);

    const completedTasks = weekTasks.filter((t) => t.completed).length;
    const totalTasks = weekTasks.length;

    const energyValues = recentContexts.filter((c) => c.energyLevel !== null).map((c) => c.energyLevel!);
    const sleepValues = recentContexts.filter((c) => c.sleepHours !== null).map((c) => c.sleepHours!);
    const moodValues = recentContexts.filter((c) => c.mood).map((c) => c.mood!);

    const avgEnergy = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : null;
    const avgSleep = sleepValues.length > 0 ? sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length : null;
    const topMood = moodValues.length > 0
      ? Object.entries(moodValues.reduce((acc, m) => ({ ...acc, [m]: (acc[m] || 0) + 1 }), {} as Record<string, number>))
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;

    const memories = await recall("recurring patterns this week", 4);
    const systemContext = buildSystemContext({ ...ctx, memories });
    const langName = LANGUAGE_NAMES[language] ?? "English";

    const statsContext = `This week's data:
- Tasks: ${completedTasks} completed out of ${totalTasks} total
- Average energy: ${avgEnergy !== null ? avgEnergy.toFixed(1) + "/10" : "no data"}
- Average sleep: ${avgSleep !== null ? avgSleep.toFixed(1) + " hours" : "no data"}
- Most common mood: ${topMood || "no data"}
- Days logged: ${recentContexts.length} out of 7`;

    const { object } = await generateObject({
      model: getModel(ctx.agent.model),
      schema: z.object({ message: z.string() }),
      system: systemContext,
      prompt: `${statsContext}\n\nGive me a warm, personal weekly recap as Luna. Reference the actual numbers. Keep it 2-3 sentences max. Respond entirely in ${langName}.`,
      maxOutputTokens: 220,
    });

    return res.json({
      message: object.message,
      stats: {
        tasksCompleted: completedTasks,
        tasksTotal: totalTasks,
        avgSleep: avgSleep !== null ? Math.round(avgSleep * 10) / 10 : null,
        avgEnergy: avgEnergy !== null ? Math.round(avgEnergy * 10) / 10 : null,
        topMood,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate weekly recap");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
