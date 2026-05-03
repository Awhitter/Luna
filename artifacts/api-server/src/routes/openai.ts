import { Router } from "express";
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

    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, parsed.data.id))
      .orderBy(messages.createdAt);

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

    const result = await db.select().from(messages)
      .where(eq(messages.conversationId, parsed.data.id))
      .orderBy(messages.createdAt);
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
  pendingTasks: typeof tasks.$inferSelect[]
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
    if (today.energyLevel) ctx += `\n- Energy today: ${today.energyLevel}/10`;
    if (today.mood) ctx += `\n- Mood: ${today.mood}`;
  }

  if (pendingTasks.length > 0) {
    ctx += `\n- Already on her list: ${pendingTasks.map(t => t.title).join(", ")}`;
  }

  ctx += `\n\nWhen she asks you to add tasks or help plan her day, respond conversationally AND include a JSON block that the app processes silently (never show it as code):
[TASKS:{"tasks":[{"title":"Task name","category":"work|home|health|kids|self-care|food","priority":"low|medium|high","view":"today|week|month"}]}]

Be her Luna — specific, warm, and always in her corner.`;

  return ctx;
}

router.post("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const idParsed = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
    if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

    const parsed = SendOpenaiMessageBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

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

    const systemContext = buildSystemContext(profile, lastPeriod, todayData, pendingTasks);

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

    await db.insert(messages).values({
      conversationId: convId,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
    res.end();
  }
});

router.post("/openai/suggest-tasks", async (req, res) => {
  try {
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

    const systemContext = buildSystemContext(profile, lastPeriod, todayData, pendingTasks);

    const prompt = `Based on everything you know about her right now — her energy (${todayData?.energyLevel ?? "??"}/10), mood (${todayData?.mood ?? "unknown"}), sleep (${todayData?.sleepHours ?? "??"}h), her cycle phase, her life — suggest exactly 3 tasks she should do today.

These must feel personally chosen for her, not generic. Think: what would a caring best friend who knows her well say "hey, today you should really..."?

Respond ONLY with valid JSON in this exact format, no extra text:
{"message":"A short, warm, personal 1-sentence note from Luna about why these 3 things make sense for today","suggestions":[{"title":"task title","category":"work|home|health|kids|self-care|food","priority":"low|medium|high","reason":"one short phrase why this fits today"}]}`;

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

export default router;
