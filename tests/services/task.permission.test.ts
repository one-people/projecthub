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
let ownerId: string;
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
  ownerId = fresh!.ownerId;
  const roles = fresh!.memberRoles;
  guestId = Object.entries(roles).find(([, r]) => r === "guest")![0];
  memberId = Object.entries(roles).find(([, r]) => r === "member")![0];
  // 按 fractional order 取第一个任务（待办列），避免 uuid 主键序随机取到其他列的任务
  task = (await db.tasks
    .where("projectId")
    .equals(project.id)
    .toArray()
  ).sort((a, b) => (a.order < b.order ? -1 : 1))[0]!;
});

describe("taskService RBAC（服务内解析角色）", () => {
  it("只读访客不能移动任务", async () => {
    await expect(
      taskService.moveTask(guestId, task.id, columns[1]!.id, null, null),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("只读访客不能创建任务", async () => {
    await expect(
      taskService.create(guestId, {
        id: "t-new",
        projectId: project.id,
        title: "新任务",
        status: columns[0]!.id,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("非成员（memberRoles 无记录）不能更新任务", async () => {
    await expect(
      taskService.updateTask("u-outsider", task.id, { title: "越权" }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("成员可以移动任务且状态流转生效", async () => {
    const done = columns[3]!;
    const moved = await taskService.moveTask(memberId, task.id, done.id, null, null);
    expect(moved.status).toBe(done.id);
    expect(moved.completedAt).not.toBeNull();
  });

  it("所有者可以更新任务", async () => {
    const updated = await taskService.updateTask(ownerId, task.id, { title: "所有者改标题" });
    expect(updated.title).toBe("所有者改标题");
  });

  it("同列重排不变更完成态", async () => {
    await db.tasks.update(task.id, { assigneeId: "u-assignee" });
    const moved = await taskService.moveTask(memberId, task.id, task.status, null, null);
    expect(moved.completedAt).toBeNull();
  });
});
