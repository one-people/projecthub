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
  await db.users.add({ id: uid, name: "我", avatarColor: "#3B82F6", createdAt: now });
  await db.projects.add({
    id: "p1", name: "项目A", description: "", statusColumns: [
      { id: "c1", name: "待办", order: 0, isDone: false }, { id: "c2", name: "完成", order: 1, isDone: true },
    ], memberRoles: { [uid]: "member" }, createdAt: now, updatedAt: now, version: 0,
  });
  await db.tasks.bulkAdd([
    { id: "t1", projectId: "p1", title: "待处理", descriptionRich: null, status: "c1", assigneeId: uid, dueDate: today, priority: "high", labels: [], subtasks: [], order: "a0", archived: false, completedAt: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t2", projectId: "p1", title: "已逾期", descriptionRich: null, status: "c1", assigneeId: uid, dueDate: overdue, priority: "urgent", labels: [], subtasks: [], order: "a1", archived: false, completedAt: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t3", projectId: "p1", title: "别人的", descriptionRich: null, status: "c1", assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [], order: "a2", archived: false, completedAt: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t4", projectId: "p1", title: "已完成", descriptionRich: null, status: "c2", assigneeId: uid, dueDate: null, priority: "none", labels: [], subtasks: [], order: "a3", archived: false, completedAt: new Date().toISOString(), createdAt: now, updatedAt: now, version: 0 },
  ]);
  return uid;
}

describe("workbenchService.load", () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.users.clear(), db.notifications.clear()]);
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
});
