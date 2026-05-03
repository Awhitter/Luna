import { Router } from "express";
import { db, dailyContexts } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
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

router.get("/daily-context/streak", async (req, res) => {
  try {
    const all = await db.select({ date: dailyContexts.date })
      .from(dailyContexts)
      .orderBy(asc(dailyContexts.date));

    const totalCheckins = all.length;

    if (totalCheckins === 0) {
      return res.json({ currentStreak: 0, longestStreak: 0, lastCheckinDate: null, totalCheckins: 0 });
    }

    const dates = all.map((r) => r.date).sort();
    const lastCheckinDate = dates[dates.length - 1] ?? null;

    // Build streaks by iterating sorted unique dates
    let longestStreak = 1;
    let runLen = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]!);
      const curr = new Date(dates[i]!);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        runLen++;
        if (runLen > longestStreak) longestStreak = runLen;
      } else if (diffDays > 1) {
        runLen = 1;
      }
    }

    // Current streak: walk backwards from today (or yesterday)
    const todayISO = new Date().toISOString().split("T")[0]!;
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayISO = yesterdayDate.toISOString().split("T")[0]!;

    const dateSet = new Set(dates);
    let currentStreak = 0;

    // Only count if last check-in was today or yesterday
    if (lastCheckinDate === todayISO || lastCheckinDate === yesterdayISO) {
      const startISO = lastCheckinDate === todayISO ? todayISO : yesterdayISO;
      let cursor = new Date(startISO);
      while (true) {
        const iso = cursor.toISOString().split("T")[0]!;
        if (!dateSet.has(iso)) break;
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    return res.json({ currentStreak, longestStreak, lastCheckinDate, totalCheckins });
  } catch (err) {
    req.log.error({ err }, "Failed to get check-in streak");
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
