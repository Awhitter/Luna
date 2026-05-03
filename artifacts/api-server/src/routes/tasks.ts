import { Router } from "express";
import { db, tasks } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  CreateTaskBody,
  UpdateTaskBody,
  ListTasksQueryParams,
  GetTaskParams,
  UpdateTaskParams,
  DeleteTaskParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/tasks/summary", async (req, res) => {
  try {
    const all = await db.select().from(tasks);

    const todayTasks = all.filter(t => t.view === "today");
    const weekTasks = all.filter(t => t.view === "week");
    const monthTasks = all.filter(t => t.view === "month");

    const categoryCounts: Record<string, { total: number; completed: number }> = {};
    for (const task of all) {
      if (!categoryCounts[task.category]) {
        categoryCounts[task.category] = { total: 0, completed: 0 };
      }
      categoryCounts[task.category].total++;
      if (task.completed) categoryCounts[task.category].completed++;
    }

    return res.json({
      today: {
        total: todayTasks.length,
        completed: todayTasks.filter(t => t.completed).length,
      },
      week: {
        total: weekTasks.length,
        completed: weekTasks.filter(t => t.completed).length,
      },
      month: {
        total: monthTasks.length,
        completed: monthTasks.filter(t => t.completed).length,
      },
      byCategory: Object.entries(categoryCounts).map(([category, counts]) => ({
        category,
        ...counts,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get tasks summary");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const parsed = ListTasksQueryParams.safeParse(req.query);
    const params = parsed.success ? parsed.data : {};

    let query = db.select().from(tasks);
    const conditions = [];

    if (params.view) conditions.push(eq(tasks.view, params.view));
    if (params.category) conditions.push(eq(tasks.category, params.category));
    if (params.completed !== undefined) conditions.push(eq(tasks.completed, params.completed));

    const result = conditions.length > 0
      ? await db.select().from(tasks).where(and(...conditions))
      : await db.select().from(tasks);

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list tasks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tasks", async (req, res) => {
  try {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const result = await db.insert(tasks).values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      priority: parsed.data.priority,
      view: parsed.data.view,
      dueDate: parsed.data.dueDate ?? null,
      aiSuggested: parsed.data.aiSuggested ?? false,
      completed: false,
    }).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tasks/:id", async (req, res) => {
  try {
    const parsed = GetTaskParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

    const result = await db.select().from(tasks).where(eq(tasks.id, parsed.data.id));
    if (result.length === 0) return res.status(404).json({ error: "Task not found" });
    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/tasks/:id", async (req, res) => {
  try {
    const idParsed = UpdateTaskParams.safeParse({ id: Number(req.params.id) });
    if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

    const parsed = UpdateTaskBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const result = await db.update(tasks)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tasks.id, idParsed.data.id))
      .returning();

    if (result.length === 0) return res.status(404).json({ error: "Task not found" });
    return res.json(result[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const parsed = DeleteTaskParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

    const result = await db.delete(tasks).where(eq(tasks.id, parsed.data.id)).returning();
    if (result.length === 0) return res.status(404).json({ error: "Task not found" });
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
