import { Router } from "express";
import { db, dailyContexts } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateDailyContextBody } from "@workspace/api-zod";

const router = Router();

router.get("/daily-context", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    const result = await db.select().from(dailyContexts).orderBy(desc(dailyContexts.date)).limit(limit);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list daily contexts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/daily-context", async (req, res) => {
  try {
    const parsed = CreateDailyContextBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const existing = await db.select().from(dailyContexts).where(eq(dailyContexts.date, parsed.data.date));
    if (existing.length > 0) {
      const updated = await db.update(dailyContexts)
        .set({
          sleepHours: parsed.data.sleepHours ?? null,
          energyLevel: parsed.data.energyLevel ?? null,
          mood: parsed.data.mood ?? null,
          notes: parsed.data.notes ?? null,
        })
        .where(eq(dailyContexts.date, parsed.data.date))
        .returning();
      return res.status(201).json(updated[0]);
    }

    const result = await db.insert(dailyContexts).values({
      date: parsed.data.date,
      sleepHours: parsed.data.sleepHours ?? null,
      energyLevel: parsed.data.energyLevel ?? null,
      mood: parsed.data.mood ?? null,
      notes: parsed.data.notes ?? null,
    }).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create daily context");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/daily-context/today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const result = await db.select().from(dailyContexts).where(eq(dailyContexts.date, today));
    if (result.length === 0) return res.status(404).json({ error: "No entry for today" });
    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get today context");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
