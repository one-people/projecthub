import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { taskService, PermissionError } from "~/services/task.service";
import { projectRepository } from "~/repositories/project.repository";
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

  it("成员可以修改标题与优先级", async () => {
    const updated = await taskService.updateTask("actor", "member", task.id, {
      title: "新标题",
      priority: "urgent",
    });
    expect(updated.title).toBe("新标题");
    expect(updated.priority).toBe("urgent");
    expect(updated.version).toBeGreaterThan(task.version);
  });

  it("指派负责人生效", async () => {
    const updated = await taskService.updateTask("actor", "member", task.id, { assigneeId: "u-1" });
    expect(updated.assigneeId).toBe("u-1");
  });

  it("状态切换到完成列自动记录 completedAt", async () => {
    const done = columns.find((c) => c.isDone)!;
    const updated = await taskService.updateTask("actor", "member", task.id, {
      status: done.id,
    });
    expect(updated.status).toBe(done.id);
    expect(updated.completedAt).not.toBeNull();
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
