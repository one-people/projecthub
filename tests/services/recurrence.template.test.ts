import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { taskService } from "~/services/task.service";
import { taskTemplateService } from "~/services/taskTemplate.service";
import { uuid } from "~/lib/id";
import type { Task } from "~/models/task";

const P = "p1";
const COL_TODO = "col-todo";
const COL_DOING = "col-doing";
const COL_DONE = "col-done";

async function seedProject() {
  await db.projects.put({
    id: P,
    name: "测试项目",
    description: "",
    statusColumns: [
      { id: COL_TODO, name: "待办", isDone: false, order: 0 },
      { id: COL_DOING, name: "进行中", isDone: false, order: 1 },
      { id: COL_DONE, name: "已完成", isDone: true, order: 2 },
    ],
    ownerId: "u1",
    memberRoles: {},
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never);
}

async function makeTask(overrides: Partial<Task> = {}): Promise<Task> {
  return taskService.create("u1", {
    id: uuid(),
    projectId: P,
    title: "周报",
    status: COL_TODO,
    ...overrides,
  });
}

describe("重复任务", () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.tasks.clear();
    await db.taskTemplates.clear();
    await seedProject();
  });

  it("完成每日重复任务 → 生成下一期（dueDate+1 天、回到首列、子任务重置）", async () => {
    const task = await makeTask({
      dueDate: "2026-09-28T00:00:00.000Z",
      startDate: "2026-09-27T00:00:00.000Z",
      recurrence: "daily",
      subtasks: [{ id: uuid(), title: "收集数据", done: true }],
      status: COL_DOING,
    });
    await taskService.updateTask("u1", task.id, { completed: true });

    const all = await db.tasks.toArray();
    expect(all).toHaveLength(2);
    const next = all.find((t) => t.id !== task.id)!;
    expect(next.title).toBe("周报");
    expect(next.status).toBe(COL_TODO);
    expect(next.completedAt).toBeNull();
    expect(next.recurrence).toBe("daily");
    expect(next.dueDate).toBe("2026-09-29T00:00:00.000Z");
    expect(next.startDate).toBe("2026-09-28T00:00:00.000Z");
    expect(next.subtasks).toHaveLength(1);
    expect(next.subtasks[0]!.done).toBe(false);
  });

  it("每周/每月推进正确（月底收敛）", async () => {
    const weekly = await makeTask({ dueDate: "2026-09-28T00:00:00.000Z", recurrence: "weekly" });
    await taskService.updateTask("u1", weekly.id, { completed: true });
    const monthly = await makeTask({ dueDate: "2026-01-31T00:00:00.000Z", recurrence: "monthly" });
    await taskService.updateTask("u1", monthly.id, { completed: true });

    const all = await db.tasks.toArray();
    const nextWeekly = all.find((t) => t.title === "周报" && t.dueDate === "2026-10-05T00:00:00.000Z");
    const nextMonthly = all.find((t) => t.dueDate === "2026-02-28T00:00:00.000Z");
    expect(nextWeekly).toBeTruthy();
    expect(nextMonthly).toBeTruthy();
  });

  it("非重复任务完成不生成下一期；取消完成也不生成", async () => {
    const task = await makeTask({ recurrence: "none" });
    await taskService.updateTask("u1", task.id, { completed: true });
    expect(await db.tasks.count()).toBe(1);
    await taskService.updateTask("u1", task.id, { completed: false });
    expect(await db.tasks.count()).toBe(1);
  });

  it("拖入完成列同样生成下一期", async () => {
    const task = await makeTask({ recurrence: "weekly", dueDate: "2026-09-28T00:00:00.000Z" });
    await taskService.moveTask("u1", task.id, COL_DONE, null, null);
    const all = await db.tasks.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.id !== task.id)!.dueDate).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("任务模板", () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.tasks.clear();
    await db.taskTemplates.clear();
    await seedProject();
  });

  it("从任务保存模板并快照字段", async () => {
    const task = await makeTask({
      priority: "high",
      recurrence: "weekly",
      labels: ["l1"],
      subtasks: [{ id: uuid(), title: "步骤一", done: true }],
    });
    const tpl = await taskTemplateService.createFromTask("u1", task, "周报模板");
    expect(tpl.name).toBe("周报模板");
    expect(tpl.title).toBe("周报");
    expect(tpl.priority).toBe("high");
    expect(tpl.recurrence).toBe("weekly");
    expect(tpl.labels).toEqual(["l1"]);
    expect(tpl.subtasks).toEqual([{ title: "步骤一" }]);
    expect(await taskTemplateService.listForProject(P)).toHaveLength(1);
  });

  it("模板列表只含全局 + 本项目模板", async () => {
    const t1 = await makeTask();
    await taskTemplateService.createFromTask("u1", t1, "本项目的");
    await db.taskTemplates.put({
      id: uuid(), projectId: "other", name: "别的项目", title: "x", priority: "none",
      descriptionRich: null, subtasks: [], labels: [], recurrence: "none",
      createdAt: new Date().toISOString(),
    });
    const list = await taskTemplateService.listForProject(P);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("本项目的");
  });

  it("buildTaskInput 不携带日期/负责人，子任务未完成", async () => {
    const task = await makeTask({
      dueDate: "2026-09-28T00:00:00.000Z",
      assigneeId: "u1",
      subtasks: [{ id: uuid(), title: "步骤一", done: true }],
    });
    const tpl = await taskTemplateService.createFromTask("u1", task);
    const input = taskTemplateService.buildTaskInput(tpl, P, COL_DOING);
    const created = await taskService.create("u1", input);
    expect(created.status).toBe(COL_DOING);
    expect(created.dueDate).toBeNull();
    expect(created.assigneeId).toBeNull();
    expect(created.subtasks[0]!.done).toBe(false);
    expect(created.title).toBe(tpl.title);
  });

  it("remove 删除模板", async () => {
    const task = await makeTask();
    const tpl = await taskTemplateService.createFromTask("u1", task);
    await taskTemplateService.remove("u1", tpl.id);
    expect(await db.taskTemplates.count()).toBe(0);
  });
});
