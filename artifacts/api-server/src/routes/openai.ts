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

router.post("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const idParsed = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
    if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

    const parsed = SendOpenaiMessageBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const convId = idParsed.data.id;
    const conv = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (conv.length === 0) return res.status(404).json({ error: "Conversation not found" });

    // Save user message
    await db.insert(messages).values({ conversationId: convId, role: "user", content: parsed.data.content });

    // Load context for personalized AI
    const [profileResult, cyclePhase, todayCtx, recentTasks] = await Promise.all([
      db.select().from(profiles).limit(1),
      db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(5),
      db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(1),
      db.select().from(tasks).limit(10),
    ]);

    const profile = profileResult[0];
    const today = todayCtx[0];
    const lastPeriod = cyclePhase.find(e => e.entryType === "period_start");

    let systemContext = `You are Aria, a warm, caring, and deeply empathetic AI life assistant designed specifically for women. You are like a best friend who truly understands everything about her life — her hormonal cycle, energy levels, sleep, work, children, home, and health.

Your personality:
- Warm, supportive, and human. Never clinical or robotic.
- Use casual, friendly language — like texting a trusted friend.
- Be proactive: anticipate needs, suggest what to do next.
- Remember everything the user shares and reference it naturally.
- Never overwhelm with too much info at once. Keep responses concise and actionable.
- Always acknowledge her feelings before jumping to solutions.
- Use "we" language when appropriate — you're in this together.

Current context about the user:`;

    if (profile) {
      systemContext += `\n- Name: ${profile.name}`;
      systemContext += `\n- Has kids: ${profile.hasKids ? `Yes (${profile.numberOfKids || "??"})` : "No"}`;
      if (profile.workSchedule) systemContext += `\n- Work schedule: ${profile.workSchedule}`;
      if (profile.healthConditions) systemContext += `\n- Health conditions: ${profile.healthConditions}`;
      if (profile.averageSleepHours) systemContext += `\n- Average sleep: ${profile.averageSleepHours} hours`;
    }

    if (lastPeriod) {
      const today = new Date();
      const periodStart = new Date(lastPeriod.date);
      const dayInCycle = Math.floor((today.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const cycleLen = profile?.cycleLength ?? 28;
      let phase = "unknown";
      if (dayInCycle <= (profile?.periodLength ?? 5)) phase = "menstrual";
      else if (dayInCycle <= 13) phase = "follicular";
      else if (dayInCycle <= 16) phase = "ovulation";
      else phase = "luteal";
      systemContext += `\n- Cycle: Day ${dayInCycle} of cycle (${phase} phase)`;
    }

    if (today) {
      if (today.sleepHours) systemContext += `\n- Slept ${today.sleepHours} hours last night`;
      if (today.energyLevel) systemContext += `\n- Energy level today: ${today.energyLevel}/10`;
      if (today.mood) systemContext += `\n- Current mood: ${today.mood}`;
    }

    if (recentTasks.length > 0) {
      const pending = recentTasks.filter(t => !t.completed).slice(0, 5);
      if (pending.length > 0) {
        systemContext += `\n- Pending tasks: ${pending.map(t => t.title).join(", ")}`;
      }
    }

    systemContext += `\n\nWhen the user asks you to add tasks or plan their day, respond conversationally AND include a JSON block at the end of your response (never show it as code, the app processes it automatically):
[TASKS:{"tasks":[{"title":"Task name","category":"work|home|health|kids|self-care|food","priority":"low|medium|high","view":"today|week|month"}]}]

Keep your tone warm, specific to her situation, and genuinely helpful. Never be generic.`;

    // Load conversation history
    const history = await db.select().from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(messages.createdAt);

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemContext },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // Stream response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
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

export default router;
