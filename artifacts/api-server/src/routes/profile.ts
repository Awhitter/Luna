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
    const {
      name,
      hasKids,
      numberOfKids,
      workSchedule,
      healthConditions,
      averageSleepHours,
      cycleLength,
      periodLength,
      workHours,
      exercisePerWeek,
      exerciseIntensity,
      contraception,
      hydration,
    } = parsed.data;
    const result = await db.insert(profiles).values({
      name,
      hasKids,
      numberOfKids: numberOfKids ?? null,
      workSchedule: workSchedule ?? null,
      healthConditions: healthConditions ?? null,
      averageSleepHours: averageSleepHours ?? null,
      cycleLength: cycleLength ?? null,
      periodLength: periodLength ?? null,
      workHours: workHours ?? null,
      exercisePerWeek: exercisePerWeek ?? null,
      exerciseIntensity: exerciseIntensity ?? null,
      contraception: contraception ?? null,
      hydration: hydration ?? null,
    }).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function describeContraception(value: string | null | undefined): string {
  if (!value || value === "unknown" || value === "none") return "none";
  return value;
}

function buildProfileChangeSummary(
  old: typeof profiles.$inferSelect,
  data: typeof import("@workspace/api-zod").UpdateProfileBody._type
): string | null {
  const changes: string[] = [];

  if (data.contraception !== undefined) {
    const oldVal = describeContraception(old.contraception);
    const newVal = describeContraception(data.contraception);
    if (oldVal !== newVal) {
      changes.push(
        oldVal === "none"
          ? `Started using ${newVal} for contraception`
          : newVal === "none"
          ? `Stopped using ${oldVal} for contraception`
          : `Changed contraception from ${oldVal} to ${newVal}`
      );
    }
  }

  if (data.healthConditions !== undefined && data.healthConditions !== old.healthConditions) {
    if (data.healthConditions && !old.healthConditions) {
      changes.push(`Added health info: ${data.healthConditions}`);
    } else if (!data.healthConditions && old.healthConditions) {
      changes.push(`Removed health conditions from profile`);
    } else if (data.healthConditions && old.healthConditions) {
      changes.push(`Updated health info to: ${data.healthConditions}`);
    }
  }

  if (data.exercisePerWeek !== undefined && data.exercisePerWeek !== old.exercisePerWeek) {
    const intensity = data.exerciseIntensity ?? old.exerciseIntensity ?? null;
    changes.push(
      `Changed exercise to ${data.exercisePerWeek}x/week${intensity ? ` (${intensity} intensity)` : ""}`
    );
  } else if (data.exerciseIntensity !== undefined && data.exerciseIntensity !== old.exerciseIntensity) {
    changes.push(`Changed exercise intensity to ${data.exerciseIntensity}`);
  }

  if (data.hydration !== undefined && data.hydration !== old.hydration) {
    const hydrationLabels: Record<string, string> = {
      low: "low hydration",
      okay: "okay hydration",
      good: "good hydration",
      great: "great hydration",
    };
    const newLabel = hydrationLabels[data.hydration ?? ""] ?? data.hydration ?? "";
    changes.push(`Updated hydration habits to: ${newLabel}`);
  }

  if (data.workSchedule !== undefined && data.workSchedule !== old.workSchedule) {
    changes.push(`Changed work schedule to ${data.workSchedule}`);
  }

  if (data.hasKids !== undefined && data.hasKids !== old.hasKids) {
    if (data.hasKids) {
      const n = data.numberOfKids ?? old.numberOfKids;
      changes.push(`Added that she has ${n ?? "a"} kid${(n ?? 1) > 1 ? "s" : ""}`);
    } else {
      changes.push(`Updated: no kids`);
    }
  }

  if (data.cycleLength !== undefined && data.cycleLength !== old.cycleLength && data.cycleLength) {
    changes.push(`Set cycle length to ${data.cycleLength} days`);
  }

  if (data.periodLength !== undefined && data.periodLength !== old.periodLength && data.periodLength) {
    changes.push(`Set period length to ${data.periodLength} days`);
  }

  return changes.length > 0 ? changes.join(". ") + "." : null;
}

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
    const old = existing[0];

    const changeSummary = buildProfileChangeSummary(old, parsed.data);

    const updatePayload: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    if (changeSummary !== null) {
      const existing_note = old.pendingLunaNote;
      updatePayload.pendingLunaNote = existing_note
        ? `${existing_note} ${changeSummary}`
        : changeSummary;
    }

    const result = await db.update(profiles)
      .set(updatePayload)
      .where(eq(profiles.id, old.id))
      .returning();
    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
