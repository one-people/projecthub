import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { taskService, PermissionError } from "~/services/task.service";
import { projectRepository } from "~/repositories/project.repository";
import { auditService } from "~/services/audit.service";
import { db } from "~/repositories/db";
import type { Project, StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";

let project: Project;
let columns: StatusColumn[];
let task: Task;

beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.tasks.clear(),
    db.comments.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
  ]);
  project = await projectRepository.createDemo();
  const fresh = await projectRepository.get(project.id);
  columns = fresh!.statusColumns;
  // 按 fractional order 取第一个任务（待办列），避免 uuid 主键序随机取到已完成列的任务
  task = (await db.tasks
    .where("projectId")
    .equals(project.id)
    .toArray()
  ).sort((a, b) => (a.order < b.order ? -1 : 1))[0]!;
});

describe("taskService.updateTask", () => {
  it("只读访客不能编辑任务", async () => {
    await expect(
      taskService.updateTask("actor", "guest", task.id, { title: "x" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("空标题被拒绝", async () => {
    await expect(
      taskService.updateTask("actor", "member", task.id, { title: "  " }),
    ).rejects.toThrow();
  });

  it("成员可以修改标题与优先级并写入审计", async () => {
    const updated = await taskService.updateTask("actor", "member", task.id, {
      title: "新标题",
      priority: "urgent",
    });
    expect(updated.title).toBe("新标题");
    expect(updated.priority).toBe("urgent");
    expect(updated.version).toBeGreaterThan(task.version);

    const logs = await auditService.list({ entityType: "task" });
    const mine = logs.filter((l) => l.entityId === task.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]!.summary).toContain("标题");
    expect(mine[0]!.summary).toContain("优先级");
  });

  it("指派负责人会发送 assign 通知", async () => {
    await taskService.updateTask("actor", "member", task.id, { assigneeId: "u-1" });
    const notices = await db.notifications.where("userId").equals("u-1").toArray();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.type).toBe("assign");
  });

  it("状态切换到完成列自动记录 completedAt 并通知负责人", async () => {
    const done = columns.find((c) => c.isDone)!;
    await db.tasks.update(task.id, { assigneeId: "u-assignee" });
    const updated = await taskService.updateTask("actor", "member", task.id, {
      status: done.id,
    });
    expect(updated.status).toBe(done.id);
    expect(updated.completedAt).not.toBeNull();
    const notices = await db.notifications
      .where("userId")
      .equals("u-assignee")
      .toArray();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.type).toBe("status_change");
  });

  it("completed=true 流转到完成列并记录 completedAt", async () => {
    const done = columns.find((c) => c.isDone)!;
    const updated = await taskService.updateTask("actor", "member", task.id, {
      completed: true,
    });
    expect(updated.status).toBe(done.id);
    expect(updated.completedAt).not.toBeNull();
  });

  it("completed=false 清除 completedAt 并回到未完成列", async () => {
    const done = columns.find((c) => c.isDone)!;
    const firstActive = [...columns].filter((c) => !c.isDone).sort((a, b) => a.order - b.order)[0]!;
    const finished = await taskService.updateTask("actor", "member", task.id, {
      completed: true,
    });
    expect(finished.status).toBe(done.id);
    const reopened = await taskService.updateTask("actor", "member", finished.id, {
      completed: false,
    });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.status).toBe(firstActive.id);
  });

  it("无变化的字段不重复写库（version 不变）", async () => {
    const updated = await taskService.updateTask("actor", "member", task.id, {
      title: task.title,
    });
    expect(updated.version).toBe(task.version);
  });
});
