import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { trashService } from "../app/services/trash.service";
import { taskRepository, VersionConflictError } from "../app/repositories/task.repository";

const now = new Date().toISOString();

async function seed() {
  await db.projects.add({
    id: "p1", name: "项目", description: "", statusColumns: [
      { id: "c1", name: "待办", isDone: false, order: 0 },
    ], memberRoles: {}, deletedAt: null, createdAt: now, updatedAt: now, version: 0,
  });
  await db.tasks.add({
    id: "t1", projectId: "p1", title: "任务", descriptionRich: null, status: "c1",
    assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [],
    order: "a0", archived: false, completedAt: null,
    deletedAt: null, deletedByProjectId: null,
    createdAt: now, updatedAt: now, version: 0,
  });
  await db.comments.add({
    id: "m1", taskId: "t1", authorId: "u1", contentRich: null, mentions: [],
    deletedAt: null, createdAt: now, updatedAt: now, version: 0,
  });
}

describe("trashService", () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.comments.clear(), db.auditLogs.clear()]);
  });

  it("deleteTask 软删并级联软删评论", async () => {
    await seed();
    await trashService.deleteTask("u1", "member", "t1");
    const task = await db.tasks.get("t1");
    const comment = await db.comments.get("m1");
    expect(task?.deletedAt).toBeTruthy();
    expect(comment?.deletedAt).toBeTruthy();
    expect((await db.auditLogs.toArray()).some((a) => a.action === "delete" && a.entityId === "t1")).toBe(true);
  });

  it("guest 无删除权限", async () => {
    await seed();
    await expect(trashService.deleteTask("u1", "guest", "t1")).rejects.toThrow(/权限/);
  });

  it("deleteProject 级联软删任务并标记 deletedByProjectId", async () => {
    await seed();
    await trashService.deleteProject("u1", "admin", "p1");
    expect((await db.projects.get("p1"))?.deletedAt).toBeTruthy();
    const task = await db.tasks.get("t1");
    expect(task?.deletedAt).toBeTruthy();
    expect(task?.deletedByProjectId).toBe("p1");
  });

  it("restoreProject 级联恢复", async () => {
    await seed();
    await trashService.deleteProject("u1", "admin", "p1");
    await trashService.restoreProject("u1", "admin", "p1");
    expect((await db.projects.get("p1"))?.deletedAt).toBeNull();
    expect((await db.tasks.get("t1"))?.deletedAt).toBeNull();
    expect((await db.tasks.get("t1"))?.deletedByProjectId).toBeNull();
  });

  it("restoreTask 只恢复独立删除的任务", async () => {
    await seed();
    await trashService.deleteProject("u1", "admin", "p1");
    await expect(trashService.restoreTask("u1", "member", "t1")).rejects.toThrow(/随项目/);
    // 复位为未删除状态，再验证独立删除路径
    await db.tasks.update("t1", { deletedAt: null, deletedByProjectId: null });
    await db.projects.update("p1", { deletedAt: null });
    await trashService.deleteTask("u1", "member", "t1");
    await trashService.restoreTask("u1", "member", "t1");
    expect((await db.tasks.get("t1"))?.deletedAt).toBeNull();
  });

  it("purgeTask 物理删除", async () => {
    await seed();
    await trashService.deleteTask("u1", "member", "t1");
    await trashService.purgeTask("u1", "t1");
    expect(await db.tasks.get("t1")).toBeUndefined();
    expect(await db.comments.get("m1")).toBeUndefined();
  });
});

describe("optimistic locking", () => {
  beforeEach(async () => {
    await db.tasks.clear();
  });

  it("version 不匹配抛 VersionConflictError", async () => {
    await db.tasks.add({
      id: "t9", projectId: "p1", title: "x", descriptionRich: null, status: "c1",
      assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [],
      order: "a0", archived: false, completedAt: null,
      deletedAt: null, deletedByProjectId: null,
      createdAt: now, updatedAt: now, version: 3,
    });
    await expect(
      taskRepository.update("t9", { title: "y" }, 2),
    ).rejects.toThrow(VersionConflictError);
    const row = await db.tasks.get("t9");
    expect(row?.title).toBe("x");
    expect(row?.version).toBe(3);
  });
});
