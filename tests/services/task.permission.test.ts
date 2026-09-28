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
  // 按 fractional order 取第一个任务（待办列），避免 uuid 主键序随机取到其他列的任务
  task = (await db.tasks
    .where("projectId")
    .equals(project.id)
    .toArray()
  ).sort((a, b) => (a.order < b.order ? -1 : 1))[0]!;
});

describe("taskService RBAC", () => {
  it("只读访客不能移动任务", async () => {
    await expect(
      taskService.moveTask("actor", "guest", task.id, columns[1]!.id, null, null),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("只读访客不能创建任务", async () => {
    await expect(
      taskService.create("actor", "guest", {
        id: "t-new",
        projectId: project.id,
        title: "新任务",
        status: columns[0]!.id,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("成员可以移动任务且状态流转生效", async () => {
    const done = columns[3]!;
    const moved = await taskService.moveTask(
      "actor",
      "member",
      task.id,
      done.id,
      null,
      null,
    );
    expect(moved.status).toBe(done.id);
    expect(moved.completedAt).not.toBeNull();
  });

  it("同列重排不变更完成态", async () => {
    await db.tasks.update(task.id, { assigneeId: "u-assignee" });
    const moved = await taskService.moveTask(
      "actor",
      "member",
      task.id,
      task.status,
      null,
      null,
    );
    expect(moved.completedAt).toBeNull();
  });
});
