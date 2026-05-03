import { Router } from "express";
import { db, cycleEntries, profiles } from "@workspace/db";
import { desc } from "drizzle-orm";
import { CreateCycleEntryBody } from "@workspace/api-zod";

const router = Router();

router.get("/cycle/entries", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await db.select().from(cycleEntries).orderBy(desc(cycleEntries.date)).limit(limit);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list cycle entries");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cycle/entries", async (req, res) => {
  try {
    const parsed = CreateCycleEntryBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const result = await db.insert(cycleEntries).values({
      entryType: parsed.data.entryType,
      date: parsed.data.date,
      symptoms: parsed.data.symptoms ?? null,
      notes: parsed.data.notes ?? null,
    }).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create cycle entry");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/cycle/current-phase", async (req, res) => {
  try {
    const profileResult = await db.select().from(profiles).limit(1);
    const profile = profileResult[0];
    const cycleLength = profile?.cycleLength ?? 28;
    const periodLength = profile?.periodLength ?? 5;

    const entries = await db.select().from(cycleEntries)
      .orderBy(desc(cycleEntries.date))
      .limit(10);

    const lastPeriodStart = entries.find(e => e.entryType === "period_start");

    if (!lastPeriodStart) {
      return res.json({
        phase: "unknown",
        dayInCycle: null,
        nextPeriodIn: null,
        energyExpectation: "Track your period to get personalized insights",
        moodExpectation: "Add your cycle start date to get started",
        recommendation: "Start tracking your cycle to unlock personalized daily suggestions",
      });
    }

    const today = new Date();
    const periodStartDate = new Date(lastPeriodStart.date);
    const dayInCycle = Math.floor((today.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const nextPeriodIn = cycleLength - dayInCycle;

    let phase: string;
    let energyExpectation: string;
    let moodExpectation: string;
    let recommendation: string;

    if (dayInCycle <= periodLength) {
      phase = "menstrual";
      energyExpectation = "Low energy — your body is working hard";
      moodExpectation = "You may feel more reflective and introspective";
      recommendation = "Be gentle with yourself today. Light tasks, rest, and nourishing food. Skip the high-intensity workouts.";
    } else if (dayInCycle <= 13) {
      phase = "follicular";
      energyExpectation = "Rising energy — you're building momentum";
      moodExpectation = "Optimistic, curious, and social";
      recommendation = "Great time for new projects, creative work, and planning ahead. Your focus is sharp.";
    } else if (dayInCycle <= 16) {
      phase = "ovulation";
      energyExpectation = "Peak energy — you're in your power";
      moodExpectation = "Confident, magnetic, and communicative";
      recommendation = "Tackle your most important tasks, social events, and presentations today. You're at your best.";
    } else {
      phase = "luteal";
      energyExpectation = "Slower energy — winding down";
      moodExpectation = "More detail-oriented, may feel more sensitive";
      recommendation = "Focus on wrapping up tasks, self-care, and reflection. Reduce your task load as you approach your period.";
    }

    return res.json({
      phase,
      dayInCycle: Math.max(1, dayInCycle),
      nextPeriodIn: Math.max(0, nextPeriodIn),
      energyExpectation,
      moodExpectation,
      recommendation,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get cycle phase");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
