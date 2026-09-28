import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { workbenchService } from "../app/services/workbench.service";
import { uuid } from "../app/lib/id";

const now = new Date().toISOString();
const today = new Date().toISOString();
const overdue = new Date(Date.now() - 86400000).toISOString();

async function seed() {
  const uid = uuid();
  await db.users.add({ id: uid, name: "我", email: "", active: true, avatarColor: "#3B82F6", createdAt: now });
  await db.projects.add({
    id: "p1", name: "项目A", description: "", statusColumns: [
      { id: "c1", name: "待办", order: 0, isDone: false }, { id: "c2", name: "完成", order: 1, isDone: true },
    ], customFields: [], ownerId: uid, memberRoles: { [uid]: "member" }, deletedAt: null, createdAt: now, updatedAt: now, version: 0,
  });
  await db.tasks.bulkAdd([
    { id: "t1", projectId: "p1", parentId: null, title: "待处理", descriptionRich: null, status: "c1", assigneeId: uid, startDate: null, dueDate: today, customValues: {}, priority: "high", labels: [], subtasks: [], recurrence: "none", order: "a0", archived: false, completedAt: null, deletedAt: null, deletedByProjectId: null, deletedByParentTaskId: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t2", projectId: "p1", parentId: null, title: "已逾期", descriptionRich: null, status: "c1", assigneeId: uid, startDate: null, dueDate: overdue, customValues: {}, priority: "urgent", labels: [], subtasks: [], recurrence: "none", order: "a1", archived: false, completedAt: null, deletedAt: null, deletedByProjectId: null, deletedByParentTaskId: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t3", projectId: "p1", parentId: null, title: "别人的", descriptionRich: null, status: "c1", assigneeId: null, startDate: null, dueDate: null, customValues: {}, priority: "none", labels: [], subtasks: [], recurrence: "none", order: "a2", archived: false, completedAt: null, deletedAt: null, deletedByProjectId: null, deletedByParentTaskId: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t4", projectId: "p1", parentId: null, title: "已完成", descriptionRich: null, status: "c2", assigneeId: uid, startDate: null, dueDate: null, customValues: {}, priority: "none", labels: [], subtasks: [], recurrence: "none", order: "a3", archived: false, completedAt: new Date().toISOString(), deletedAt: null, deletedByProjectId: null, deletedByParentTaskId: null, createdAt: now, updatedAt: now, version: 0 },
  ]);
  return uid;
}

describe("workbenchService.load", () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.users.clear()]);
  });

  it("按 assignee 过滤并分四组", async () => {
    const uid = await seed();
    const data = await workbenchService.load(uid);
    expect(data.pending.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(data.today.map((t) => t.id)).toEqual(["t1"]);
    expect(data.overdue.map((t) => t.id)).toEqual(["t2"]);
    expect(data.recent.map((t) => t.id)).toContain("t1");
    expect(data.pending.every((t) => t.completedAt === null)).toBe(true);
  });

  it("项目卡片含未完成任务数", async () => {
    const uid = await seed();
    const data = await workbenchService.load(uid);
    const card = data.projects.find((p) => p.id === "p1")!;
    expect(card.openTaskCount).toBe(3);
  });

  it("非成员项目不可见，其任务也不进入我的任务", async () => {
    const uid = await seed();
    await db.projects.add({
      id: "p2", name: "别人的项目", description: "", statusColumns: [
        { id: "c1", name: "待办", order: 0, isDone: false },
      ], customFields: [], ownerId: "u-other", memberRoles: {}, deletedAt: null, createdAt: now, updatedAt: now, version: 0,
    });
    await db.tasks.add({
      id: "t5", projectId: "p2", parentId: null, title: "分配给我的越权任务", descriptionRich: null, status: "c1", assigneeId: uid,
      startDate: null, dueDate: today, customValues: {}, priority: "none", labels: [], subtasks: [], recurrence: "none",
      order: "a0", archived: false, completedAt: null, deletedAt: null, deletedByProjectId: null, deletedByParentTaskId: null, createdAt: now, updatedAt: now, version: 0,
    });
    const data = await workbenchService.load(uid);
    expect(data.projects.map((p) => p.id)).toEqual(["p1"]);
    expect(data.pending.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(data.today.map((t) => t.id)).toEqual(["t1"]);
  });

  it("weekDone 统计最近 7 天我完成的任务", async () => {
    const uid = await seed();
    const data = await workbenchService.load(uid);
    expect(data.weekDone).toBe(1);
  });
});
