import { Router } from "express";
import { db, profiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateProfileBody,
  UpdateProfileBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/profile", async (req, res) => {
  try {
    const result = await db.select().from(profiles).limit(1);
    if (result.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }
    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/profile", async (req, res) => {
  try {
    const parsed = CreateProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const { name, hasKids, numberOfKids, workSchedule, healthConditions, averageSleepHours, cycleLength, periodLength } = parsed.data;
    const result = await db.insert(profiles).values({
      name,
      hasKids,
      numberOfKids: numberOfKids ?? null,
      workSchedule: workSchedule ?? null,
      healthConditions: healthConditions ?? null,
      averageSleepHours: averageSleepHours ?? null,
      cycleLength: cycleLength ?? null,
      periodLength: periodLength ?? null,
    }).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/profile", async (req, res) => {
  try {
    const parsed = UpdateProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const existing = await db.select().from(profiles).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }
    const id = existing[0].id;
    const result = await db.update(profiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
