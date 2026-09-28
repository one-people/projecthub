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
let memberId: string;
let guestId: string;

beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.tasks.clear(),
    db.comments.clear(),
  ]);
  project = await projectRepository.createDemo();
  const fresh = await projectRepository.get(project.id);
  columns = fresh!.statusColumns;
  const roles = fresh!.memberRoles;
  memberId = Object.entries(roles).find(([, r]) => r === "member")![0];
  guestId = Object.entries(roles).find(([, r]) => r === "guest")![0];
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
      taskService.updateTask(guestId, task.id, { title: "x" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("空标题被拒绝", async () => {
    await expect(
      taskService.updateTask(memberId, task.id, { title: "  " }),
    ).rejects.toThrow();
  });

  it("成员可以修改标题与优先级", async () => {
    const updated = await taskService.updateTask(memberId, task.id, {
      title: "新标题",
      priority: "urgent",
    });
    expect(updated.title).toBe("新标题");
    expect(updated.priority).toBe("urgent");
    expect(updated.version).toBeGreaterThan(task.version);
  });

  it("指派负责人生效", async () => {
    const updated = await taskService.updateTask(memberId, task.id, { assigneeId: "u-1" });
    expect(updated.assigneeId).toBe("u-1");
  });

  it("状态切换到完成列自动记录 completedAt", async () => {
    const done = columns.find((c) => c.isDone)!;
    const updated = await taskService.updateTask(memberId, task.id, {
      status: done.id,
    });
    expect(updated.status).toBe(done.id);
    expect(updated.completedAt).not.toBeNull();
  });

  it("completed=true 流转到完成列并记录 completedAt", async () => {
    const done = columns.find((c) => c.isDone)!;
    const updated = await taskService.updateTask(memberId, task.id, {
      completed: true,
    });
    expect(updated.status).toBe(done.id);
    expect(updated.completedAt).not.toBeNull();
  });

  it("completed=false 清除 completedAt 并回到未完成列", async () => {
    const done = columns.find((c) => c.isDone)!;
    const firstActive = [...columns].filter((c) => !c.isDone).sort((a, b) => a.order - b.order)[0]!;
    const finished = await taskService.updateTask(memberId, task.id, {
      completed: true,
    });
    expect(finished.status).toBe(done.id);
    const reopened = await taskService.updateTask(memberId, finished.id, {
      completed: false,
    });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.status).toBe(firstActive.id);
  });

  it("无变化的字段不重复写库（version 不变）", async () => {
    const updated = await taskService.updateTask(memberId, task.id, {
      title: task.title,
    });
    expect(updated.version).toBe(task.version);
  });

  it("设置开始日期", async () => {
    const iso = new Date("2026-10-01T00:00:00").toISOString();
    const updated = await taskService.updateTask(memberId, task.id, {
      startDate: iso,
    });
    expect(updated.startDate).toBe(iso);
    const cleared = await taskService.updateTask(memberId, task.id, {
      startDate: null,
    });
    expect(cleared.startDate).toBeNull();
  });

  it("自定义字段值整包替换", async () => {
    const first = await taskService.updateTask(memberId, task.id, {
      customValues: { f1: "v1", f2: 2 },
    });
    expect(first.customValues).toEqual({ f1: "v1", f2: 2 });
    const second = await taskService.updateTask(memberId, task.id, {
      customValues: { f1: "v1b" },
    });
    expect(second.customValues).toEqual({ f1: "v1b" });
    expect(second.version).toBeGreaterThan(first.version);
  });
});
