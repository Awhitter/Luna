import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db, conversations, messages, profiles, cycleEntries, dailyContexts, tasks } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
} from "@workspace/api-zod";

const router = Router();

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

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

function buildSystemContext(
  profile: typeof profiles.$inferSelect | undefined,
  lastPeriod: typeof cycleEntries.$inferSelect | undefined,
  today: typeof dailyContexts.$inferSelect | undefined,
  pendingTasks: typeof tasks.$inferSelect[],
  language = "en",
  symptoms?: string[]
): string {
  let ctx = `You are Luna, a warm and deeply personal AI life assistant — like a best friend who genuinely cares, remembers everything, and always knows what you need before you ask.

Your personality:
- Warm, real, and human. Talk like you're texting your closest friend — casual, caring, never stiff.
- Use her name naturally. Reference her actual situation (her kids, her cycle, her mood) like you were there.
- Be proactive and specific — don't give generic advice, tailor everything to her.
- When she shares something hard, sit with it a moment before jumping to solutions.
- Celebrate her wins, even tiny ones. Progress matters.
- Use "we" — you're in this together, always.
- Keep it concise. She's busy. Get to the point with love.
- Occasionally use gentle emojis when it feels natural, not performative.

Current context about her life:`;

  if (profile) {
    ctx += `\n- Name: ${profile.name}`;
    ctx += `\n- Has kids: ${profile.hasKids ? `Yes (${profile.numberOfKids || "??"} kid${(profile.numberOfKids ?? 0) > 1 ? "s" : ""})` : "No"}`;
    if (profile.workSchedule) ctx += `\n- Work schedule: ${profile.workSchedule}`;
    if (profile.healthConditions) ctx += `\n- Health: ${profile.healthConditions}`;
    if (profile.averageSleepHours) ctx += `\n- Typically sleeps: ${profile.averageSleepHours} hours`;
  }

  if (lastPeriod) {
    const now = new Date();
    const periodStart = new Date(lastPeriod.date);
    const dayInCycle = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const cycleLen = profile?.cycleLength ?? 28;
    let phase = "unknown";
    if (dayInCycle <= (profile?.periodLength ?? 5)) phase = "menstrual";
    else if (dayInCycle <= 13) phase = "follicular";
    else if (dayInCycle <= 16) phase = "ovulation";
    else phase = "luteal";
    ctx += `\n- Cycle: Day ${dayInCycle} of ${cycleLen} (${phase} phase) — factor this into your energy and task suggestions`;
  }

  if (today) {
    if (today.sleepHours) ctx += `\n- Slept ${today.sleepHours} hours last night`;
    if (today.energyLevel) ctx += `\n- Energy today: ${today.energyLevel}/5`;
    if (today.mood) ctx += `\n- Mood: ${today.mood}`;
  }

  if (pendingTasks.length > 0) {
    const tasksWithTimes = pendingTasks.map(t => t.title);
    ctx += `\n- Already on her list: ${tasksWithTimes.join(", ")}`;
  }

  if (symptoms && symptoms.length > 0) {
    ctx += `\n- TODAY'S SYMPTOMS she logged: ${symptoms.join(", ")} — factor these into every suggestion. Acknowledge them naturally, suggest tasks and meals that are gentle on her body, avoid suggesting high-intensity activity.`;
  }

  ctx += `\n\nTASK ADDING RULES — follow these exactly:

1. When she mentions adding a task and hasn't specified a time, always ask: "What time do you plan to do that?" before adding it. Wait for her answer.

2. Once you have the time, check her existing task list above for any tasks at the same or nearby time (within 30 min). If there's a conflict, warn her naturally in your conversational reply — e.g. "Heads up — looks like you already have [conflicting task] at [time], just so you know!" — then still add both unless she says not to.

3. When you add tasks, always include a TASKS block that the app processes silently (NEVER render it as visible text or code):
[TASKS:{"tasks":[{"title":"Task name (include the time in the title if given, e.g. 'Doctor call (2:00 PM)')","category":"work|home|health|kids|self-care|food","priority":"low|medium|high","view":"today|week|month"}]}]

4. You can add multiple tasks in one TASKS block.

5. After adding, confirm warmly in natural language. Never show the raw JSON to the user.

Be her Luna — specific, warm, and always in her corner.`;

  if (language && language !== "en") {
    const langName = LANGUAGE_NAMES[language] ?? "English";
    ctx += `\n\nIMPORTANT: Always respond in ${langName}. Every response must be written entirely in ${langName}.`;
  }

  return ctx;
}

router.post("/openai/conversations/:id/messages", aiRateLimit, async (req, res) => {
  try {
    const idParsed = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
    if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

    const parsed = SendOpenaiMessageBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const language = (req.body.language as string) || "en";
    const symptoms = (req.body.symptoms as string[] | undefined) ?? [];
    const convId = idParsed.data.id;
    const conv = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (conv.length === 0) return res.status(404).json({ error: "Conversation not found" });

    await db.insert(messages).values({ conversationId: convId, role: "user", content: parsed.data.content });

    const [profileResult, cyclePhase, todayCtx, recentTasks] = await Promise.all([
      db.select().from(profiles).limit(1),
      db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(5),
      db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(1),
      db.select().from(tasks).limit(10),
    ]);

    const profile = profileResult[0];
    const todayData = todayCtx[0];
    const lastPeriod = cyclePhase.find(e => e.entryType === "period_start");
    const pendingTasks = recentTasks.filter(t => !t.completed).slice(0, 5);
    const systemContext = buildSystemContext(profile, lastPeriod, todayData, pendingTasks, language, symptoms.length > 0 ? symptoms : undefined);

    const history = await db.select().from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(messages.createdAt);

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemContext },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    await db.insert(messages).values({ conversationId: convId, role: "assistant", content: fullResponse });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) return res.status(500).json({ error: "Internal server error" });
    res.end();
  }
});

router.post("/openai/checkin-message", aiRateLimit, async (req, res) => {
  try {
    const { sleepHours, energyLevel, mood, language = "en", conversationId: convId } = req.body as {
      sleepHours?: number;
      energyLevel?: number;
      mood?: string;
      language?: string;
      conversationId?: number;
    };

    const [profileResult, cyclePhase, existingTasks] = await Promise.all([
      db.select().from(profiles).limit(1),
      db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(5),
      db.select().from(tasks).limit(10),
    ]);

    const profile = profileResult[0];
    const lastPeriod = cyclePhase.find(e => e.entryType === "period_start");
    const pendingTasks = existingTasks.filter(t => !t.completed).slice(0, 5);

    let cycleContext = "";
    if (lastPeriod) {
      const now = new Date();
      const periodStart = new Date(lastPeriod.date);
      const dayInCycle = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const cycleLen = profile?.cycleLength ?? 28;
      let phase = "unknown";
      if (dayInCycle <= (profile?.periodLength ?? 5)) phase = "menstrual";
      else if (dayInCycle <= 13) phase = "follicular";
      else if (dayInCycle <= 16) phase = "ovulation";
      else phase = "luteal";
      cycleContext = `Cycle: Day ${dayInCycle} of ${cycleLen} (${phase} phase)`;
    }

    const name = profile?.name ?? "there";
    const langName = LANGUAGE_NAMES[language] ?? "English";

    const checkinSummary = [
      sleepHours ? `Sleep: ${sleepHours} hours last night` : null,
      energyLevel ? `Energy: ${energyLevel}/10` : null,
      mood ? `Mood: ${mood}` : null,
      cycleContext || null,
      pendingTasks.length > 0 ? `Already on her list: ${pendingTasks.map(t => t.title).join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const prompt = `${name} just completed her morning check-in. Here's what she shared:
${checkinSummary || "No data logged"}

Write a warm, personal message FROM Luna (her AI best friend) that:
1. Briefly acknowledges what she logged — mention sleep, energy, and mood naturally, like a best friend would
2. Adds a relevant insight (e.g. if energy is low, validate it; if it's high, celebrate it; reference her cycle phase if known)
3. Ends by warmly asking what she wants to add to her to-do list today — phrase it invitingly, like you're about to help her build her plan together

Keep it to 3-4 sentences max. Genuine and warm, never generic.

IMPORTANT: Write the entire message in ${langName}.
Respond ONLY with JSON: {"message": "your message here"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        { role: "system", content: `You are Luna, a warm AI best friend assistant. Always respond in ${langName}.` },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { message?: string };
    const lunaMessage = parsed.message ?? "I'm here with you today! What would you like to add to your list?";

    if (convId) {
      try {
        await db.insert(messages).values({ conversationId: convId, role: "assistant", content: lunaMessage });
      } catch {
        // non-critical — message will still be shown in UI
      }
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

    const [profileResult, cyclePhase, todayCtx, existingTasks] = await Promise.all([
      db.select().from(profiles).limit(1),
      db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(5),
      db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(1),
      db.select().from(tasks).limit(20),
    ]);

    const profile = profileResult[0];
    const todayData = todayCtx[0];
    const lastPeriod = cyclePhase.find(e => e.entryType === "period_start");
    const pendingTasks = existingTasks.filter(t => !t.completed).slice(0, 8);
    const systemContext = buildSystemContext(profile, lastPeriod, todayData, pendingTasks, language);

    const langName = LANGUAGE_NAMES[language] ?? "English";
    const prompt = `Based on everything you know about her right now — her energy (${todayData?.energyLevel ?? "??"}/5), mood (${todayData?.mood ?? "unknown"}), sleep (${todayData?.sleepHours ?? "??"}h), her cycle phase, her life — suggest exactly 3 tasks she should do today.

These must feel personally chosen for her, not generic.

IMPORTANT: Write the "message" and "reason" fields entirely in ${langName}.
Respond ONLY with valid JSON:
{"message":"A short warm 1-sentence note in ${langName}","suggestions":[{"title":"task title (in ${langName})","category":"work|home|health|kids|self-care|food","priority":"low|medium|high","reason":"one short phrase in ${langName} why this fits today"}]}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        { role: "system", content: systemContext },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      message?: string;
      suggestions?: Array<{ title: string; category: string; priority: string; reason: string }>;
    };

    return res.json({
      message: parsed.message ?? "Here are a few things that feel right for today:",
      suggestions: (parsed.suggestions ?? []).slice(0, 3),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate task suggestions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/weekly-recap", aiRateLimit, async (req, res) => {
  try {
    const language = (req.body?.language as string) || "en";

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const startDate = sevenDaysAgo.toISOString().split("T")[0];

    const [profileResult, cyclePhase, weekContexts, weekTasks] = await Promise.all([
      db.select().from(profiles).limit(1),
      db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(5),
      db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(7),
      db.select().from(tasks).limit(30),
    ]);

    const profile = profileResult[0];
    const lastPeriod = cyclePhase.find(e => e.entryType === "period_start");
    const recentContexts = weekContexts.filter(c => c.date >= startDate);

    const completedTasks = weekTasks.filter(t => t.completed).length;
    const totalTasks = weekTasks.length;

    const energyValues = recentContexts.filter(c => c.energyLevel !== null).map(c => c.energyLevel!);
    const sleepValues = recentContexts.filter(c => c.sleepHours !== null).map(c => c.sleepHours!);
    const moodValues = recentContexts.filter(c => c.mood).map(c => c.mood!);

    const avgEnergy = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : null;
    const avgSleep = sleepValues.length > 0 ? sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length : null;
    const topMood = moodValues.length > 0
      ? Object.entries(moodValues.reduce((acc, m) => ({ ...acc, [m]: (acc[m] || 0) + 1 }), {} as Record<string, number>))
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;

    const systemContext = buildSystemContext(profile, lastPeriod, recentContexts[0], weekTasks.filter(t => !t.completed).slice(0, 5), language);
    const langName = LANGUAGE_NAMES[language] ?? "English";

    const statsContext = `This week's data:
- Tasks: ${completedTasks} completed out of ${totalTasks} total
- Average energy: ${avgEnergy !== null ? avgEnergy.toFixed(1) + "/10" : "no data"}
- Average sleep: ${avgSleep !== null ? avgSleep.toFixed(1) + " hours" : "no data"}
- Most common mood: ${topMood || "no data"}
- Days logged: ${recentContexts.length} out of 7`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      messages: [
        { role: "system", content: systemContext },
        {
          role: "user",
          content: `${statsContext}\n\nGive me a warm, personal weekly recap as Luna. Reference the actual numbers. Keep it 2-3 sentences max.\n\nIMPORTANT: Respond entirely in ${langName}.\nRespond ONLY with valid JSON:\n{"message":"your warm recap in ${langName}"}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { message?: string };

    return res.json({
      message: parsed.message ?? "You showed up this week, and that matters.",
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
