import { db } from "./db";
import { taskSchema, type Task, type TaskInput } from "~/models/task";
import { generateKeyBetween } from "~/lib/fractional-index";

function validate(row: unknown): Task {
  return taskSchema.parse(row);
}

export const taskRepository = {
  async listByProject(projectId: string): Promise<Task[]> {
    const rows = await db.tasks.where("projectId").equals(projectId).toArray();
    return rows.map(validate);
  },

  async get(id: string): Promise<Task | undefined> {
    const row = await db.tasks.get(id);
    return row ? validate(row) : undefined;
  },

  async create(input: Omit<TaskInput, "createdAt" | "updatedAt" | "version">): Promise<Task> {
    const now = new Date().toISOString();
    const last = await db.tasks
      .where("[projectId+status+order]")
      .between([input.projectId, input.status], [input.projectId, input.status, "￿"])
      .last();
    const task = validate({
      ...input,
      order: generateKeyBetween(last?.order ?? null, null),
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    await db.tasks.add(task);
    return task;
  },

  async update(id: string, patch: Partial<TaskInput>): Promise<Task> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Task ${id} not found`);
    const next = validate({
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    });
    await db.tasks.put(next);
    return next;
  },

  async move(
    id: string,
    status: string,
    prevOrder: string | null,
    nextOrder: string | null,
  ): Promise<Task> {
    return this.update(id, {
      status,
      order: generateKeyBetween(prevOrder, nextOrder),
    });
  },

  async remove(id: string): Promise<void> {
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.delete(id);
      await db.comments.where("taskId").equals(id).delete();
    });
  },
};
