import { Router } from "express";
import { db, agentConfigs, agentMemories } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { UpdateAgentConfigBody, DeleteAgentMemoryParams } from "@workspace/api-zod";
import { getActiveAgentConfig, invalidateAgentConfigCache } from "../lib/luna/identity";

const router = Router();

router.get("/admin/agent-config", async (req, res) => {
  try {
    const cfg = await getActiveAgentConfig();
    return res.json(cfg);
  } catch (err) {
    req.log.error({ err }, "Failed to load agent config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/agent-config", async (req, res) => {
  try {
    const parsed = UpdateAgentConfigBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const current = await getActiveAgentConfig();

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.persona !== undefined) updatePayload.persona = parsed.data.persona;
    if (parsed.data.rules !== undefined) updatePayload.rules = parsed.data.rules;
    if (parsed.data.model !== undefined) updatePayload.model = parsed.data.model;
    if (parsed.data.temperature !== undefined) updatePayload.temperature = parsed.data.temperature;
    if (parsed.data.maxTokens !== undefined) updatePayload.maxTokens = parsed.data.maxTokens;

    if (Object.keys(updatePayload).length === 0) {
      return res.json(current);
    }

    updatePayload.updatedAt = new Date();

    const result = await db
      .update(agentConfigs)
      .set(updatePayload)
      .where(eq(agentConfigs.id, current.id))
      .returning();

    invalidateAgentConfigCache();

    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update agent config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/memories", async (req, res) => {
  try {
    const rawLimit = req.query.limit;
    let limit = 20;
    if (typeof rawLimit === "string") {
      const parsed = Number(rawLimit);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 200) limit = Math.floor(parsed);
    }
    const rows = await db
      .select({
        id: agentMemories.id,
        conversationId: agentMemories.conversationId,
        content: agentMemories.content,
        source: agentMemories.source,
        createdAt: agentMemories.createdAt,
      })
      .from(agentMemories)
      .orderBy(desc(agentMemories.createdAt))
      .limit(limit);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list memories");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/memories/:id", async (req, res) => {
  try {
    const parsed = DeleteAgentMemoryParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

    const result = await db
      .delete(agentMemories)
      .where(eq(agentMemories.id, parsed.data.id))
      .returning();

    if (result.length === 0) return res.status(404).json({ error: "Memory not found" });
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete memory");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
