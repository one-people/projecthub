import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { labelService } from "~/services/label.service";
import { taskService } from "~/services/task.service";
import { projectRepository } from "~/repositories/project.repository";
import { db } from "~/repositories/db";
import { LABEL_COLORS } from "~/models/label";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";

let project: Project;
let task: Task;

beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.tasks.clear(),
    db.comments.clear(),
    db.labels.clear(),
  ]);
  project = await projectRepository.createDemo();
  // 按 fractional order 取第一个任务，规避 fake-indexeddb 的主键序
  task = (await db.tasks
    .where("projectId")
    .equals(project.id)
    .toArray()
  ).sort((a, b) => (a.order < b.order ? -1 : 1))[0]!;
});

describe("labelService", () => {
  it("创建标签并按项目列出", async () => {
    const created = await labelService.create(project.ownerId, project.id, " 前端 ");
    expect(created.name).toBe("前端");
    expect(created.projectId).toBe(project.id);
    expect(LABEL_COLORS).toContain(created.color);
    const list = await labelService.list(project.id);
    expect(list.map((l) => l.name)).toEqual(["前端"]);
  });

  it("空名与重名被拒绝", async () => {
    await expect(labelService.create(project.ownerId, project.id, "  ")).rejects.toThrow();
    await labelService.create(project.ownerId, project.id, "前端");
    await expect(labelService.create(project.ownerId, project.id, "前端")).rejects.toThrow();
  });

  it("颜色从未使用色中轮换，用尽后回落", async () => {
    for (let i = 0; i < LABEL_COLORS.length; i++) {
      await labelService.create(project.ownerId, project.id, `L${i}`);
    }
    const list = await labelService.list(project.id);
    expect(new Set(list.map((l) => l.color)).size).toBe(LABEL_COLORS.length);
    const extra = await labelService.create(project.ownerId, project.id, "extra");
    expect(LABEL_COLORS).toContain(extra.color);
  });

  it("重命名与换色", async () => {
    const created = await labelService.create(project.ownerId, project.id, "前端");
    await labelService.update(project.ownerId, created.id, { name: "设计", color: "#0EA5E9" });
    const list = await labelService.list(project.id);
    expect(list[0]!.name).toBe("设计");
    expect(list[0]!.color).toBe("#0EA5E9");
  });

  it("删除标签时从所有任务上移除引用", async () => {
    const a = await labelService.create(project.ownerId, project.id, "A");
    const b = await labelService.create(project.ownerId, project.id, "B");
    const updated = await taskService.updateTask(project.ownerId, task.id, {
      labels: [a.id, b.id],
    });
    expect(updated.labels).toEqual([a.id, b.id]);
    await labelService.remove(project.ownerId, a.id);
    const after = (await db.tasks.get(task.id))!;
    expect(after.labels).toEqual([b.id]);
    expect((await labelService.list(project.id)).map((l) => l.name)).toEqual(["B"]);
  });

  it("updateTask 支持标签变更并推进版本", async () => {
    const a = await labelService.create(project.ownerId, project.id, "A");
    const updated = await taskService.updateTask(project.ownerId, task.id, {
      labels: [a.id],
    });
    expect(updated.labels).toEqual([a.id]);
    expect(updated.version).toBeGreaterThan(task.version);
  });
});
