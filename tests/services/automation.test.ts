import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { taskService } from "~/services/task.service";
import { automationService } from "~/services/automation.service";
import { uuid } from "~/lib/id";
import type { Project } from "~/models/project";

const P = "p1";
const COL_TODO = "col-todo";
const COL_DOING = "col-doing";
const COL_DONE = "col-done";
const NOW = new Date().toISOString();

async function seedProject() {
  const project: Project = {
    id: P,
    name: "测试项目",
    description: "",
    statusColumns: [
      { id: COL_TODO, name: "待办", isDone: false, order: 0 },
      { id: COL_DOING, name: "进行中", isDone: false, order: 1 },
      { id: COL_DONE, name: "已完成", isDone: true, order: 2 },
    ],
    customFields: [],
    memberRoles: { u1: "admin" },
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
  };
  await db.projects.add(project);
}

function makeTask(status = COL_TODO) {
  return taskService.create("u1", "admin", {
    id: uuid(), projectId: P, title: "任务", status,
  });
}

describe("automationService", () => {
  beforeEach(async () => {
    await Promise.all([
      db.projects.clear(), db.tasks.clear(), db.automations.clear(), db.labels.clear(),
    ]);
    await seedProject();
  });

  it("校验：进入某列必须选列；非优先级动作必须选值", async () => {
    await expect(automationService.create(P, {
      name: "规则", trigger: { type: "status_entered", columnId: null }, action: { type: "assign", value: "u2" },
    })).rejects.toThrow();
    await expect(automationService.create(P, {
      name: "规则", trigger: { type: "task_created", columnId: null }, action: { type: "move_to", value: null },
    })).rejects.toThrow();
    await expect(automationService.create(P, {
      name: " ", trigger: { type: "task_created", columnId: null }, action: { type: "set_priority", value: null },
    })).rejects.toThrow();
  });

  it("任务创建 → 自动指派", async () => {
    await automationService.create(P, {
      name: "新建即指派", trigger: { type: "task_created", columnId: null }, action: { type: "assign", value: "u2" },
    });
    const task = await makeTask();
    const row = await db.tasks.get(task.id);
    expect(row!.assigneeId).toBe("u2");
  });

  it("进入某列 → 只匹配该列；完成触发独立", async () => {
    await automationService.create(P, {
      name: "进进行中设高优", trigger: { type: "status_entered", columnId: COL_DOING }, action: { type: "set_priority", value: "high" },
    });
    const task = await makeTask(COL_TODO);
    // 移到完成列：不匹配 COL_DOING 规则
    await taskService.moveTask("u1", "admin", task.id, COL_DONE, null, null);
    let row = await db.tasks.get(task.id);
    expect(row!.priority).toBe("none");
    expect(row!.completedAt).toBeTruthy();

    // 移回进行中：规则命中
    await taskService.moveTask("u1", "admin", task.id, COL_DOING, null, null);
    row = await db.tasks.get(task.id);
    expect(row!.priority).toBe("high");
  });

  it("完成时 → 加标签（去重）", async () => {
    await db.labels.add({ id: "l1", projectId: P, name: "紧急", color: "#DC2626", createdAt: NOW });
    await automationService.create(P, {
      name: "完成打标", trigger: { type: "task_completed", columnId: null }, action: { type: "add_label", value: "l1" },
    });
    const task = await makeTask();
    await taskService.updateTask("u1", "admin", task.id, { completed: true });
    let row = await db.tasks.get(task.id);
    expect(row!.labels).toEqual(["l1"]);
    // 再次完成（已完成的重复触发）不重复加标签
    await taskService.updateTask("u1", "admin", task.id, { labels: ["l1"] });
    row = await db.tasks.get(task.id);
    expect(row!.labels).toEqual(["l1"]);
  });

  it("停用规则不触发；update/remove 生效", async () => {
    const rule = await automationService.create(P, {
      name: "新建移动", trigger: { type: "task_created", columnId: null }, action: { type: "move_to", value: COL_DOING },
    });
    await automationService.update(rule.id, { enabled: false });
    const task = await makeTask();
    let row = await db.tasks.get(task.id);
    expect(row!.status).toBe(COL_TODO);

    await automationService.update(rule.id, { enabled: true });
    const task2 = await makeTask();
    row = await db.tasks.get(task2.id);
    expect(row!.status).toBe(COL_DOING);

    await automationService.remove(rule.id);
    expect(await automationService.list(P)).toHaveLength(0);
  });

  it("stripProject 清理项目规则", async () => {
    await automationService.create(P, {
      name: "A", trigger: { type: "task_created", columnId: null }, action: { type: "set_priority", value: "low" },
    });
    await automationService.stripProject(P);
    expect(await db.automations.count()).toBe(0);
  });
});
