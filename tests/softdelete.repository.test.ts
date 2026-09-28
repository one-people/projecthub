import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { taskRepository } from "../app/repositories/task.repository";
import { projectRepository } from "../app/repositories/project.repository";

const now = new Date().toISOString();

async function seedTask(id: string, deletedAt: string | null) {
  await db.tasks.add({
    id, projectId: "p1", title: `任务${id}`, descriptionRich: null, status: "c1",
    assigneeId: null, startDate: null, dueDate: null, customValues: {}, priority: "none", labels: [], subtasks: [],
    order: `a${id}`, archived: false, completedAt: null,
    deletedAt, deletedByProjectId: null,
    createdAt: now, updatedAt: now, version: 0,
  });
}

describe("soft delete filtering", () => {
  beforeEach(async () => {
    await db.tasks.clear();
    await db.projects.clear();
  });

  it("listByProject 默认排除软删，listDeleted 只含软删", async () => {
    await seedTask("t1", null);
    await seedTask("t2", now);
    const live = await taskRepository.listByProject("p1");
    const dead = await taskRepository.listDeleted();
    expect(live.map((t) => t.id)).toEqual(["t1"]);
    expect(dead.map((t) => t.id)).toEqual(["t2"]);
  });

  it("getDeleted 返回软删行", async () => {
    await seedTask("t2", now);
    expect((await taskRepository.getDeleted("t2"))?.id).toBe("t2");
    expect(await taskRepository.getDeleted("t1")).toBeUndefined();
  });

  it("projectRepository.list 排除软删项目", async () => {
    await db.projects.bulkAdd([
      { id: "p1", name: "活", description: "", statusColumns: [], customFields: [], memberRoles: {}, deletedAt: null, createdAt: now, updatedAt: now, version: 0 },
      { id: "p2", name: "死", description: "", statusColumns: [], customFields: [], memberRoles: {}, deletedAt: now, createdAt: now, updatedAt: now, version: 0 },
    ]);
    const list = await projectRepository.list();
    expect(list.map((p) => p.id)).toEqual(["p1"]);
    const deleted = await projectRepository.listDeleted();
    expect(deleted.map((p) => p.id)).toEqual(["p2"]);
  });
});
