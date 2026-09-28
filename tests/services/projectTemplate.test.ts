import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { projectTemplateService, blankTemplate } from "~/services/projectTemplate.service";
import { taskService } from "~/services/task.service";
import { taskTemplateService } from "~/services/taskTemplate.service";
import { labelService } from "~/services/label.service";
import { uuid } from "~/lib/id";
import type { Project } from "~/models/project";

const now = new Date().toISOString();

async function seedProject(id: string): Promise<Project> {
  const project: Project = {
    id,
    name: "源项目",
    description: "描述",
    statusColumns: [
      { id: "c1", name: "待办", isDone: false, order: 0 },
      { id: "c2", name: "进行中", isDone: false, order: 1 },
      { id: "c3", name: "已完成", isDone: true, order: 2 },
    ],
    customFields: [{ id: "f1", name: "Story Points", type: "number", options: [] }],
    ownerId: "u1",
    memberRoles: { u1: "admin" },
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
  await db.projects.add(project);
  return project;
}

describe("projectTemplateService", () => {
  beforeEach(async () => {
    await Promise.all([
      db.projects.clear(), db.labels.clear(), db.taskTemplates.clear(),
      db.projectTemplates.clear(), db.tasks.clear(),
    ]);
  });

  it("list = 空白 + 内置模板（中英文），已保存模板排后面", async () => {
    const zh = await projectTemplateService.list("zh-CN");
    expect(zh.slice(0, 4).map((t) => t.id)).toEqual([
      "tpl-blank", "tpl-builtin-rd", "tpl-builtin-marketing", "tpl-builtin-content",
    ]);
    expect(zh[1]!.name).toBe("研发迭代");
    expect(zh[1]!.columns[3]!.isDone).toBe(true);

    const en = await projectTemplateService.list("en");
    expect(en[1]!.name).toBe("R&D Sprint");
    expect(en[1]!.columns[0]!.name).toBe("To do");
  });

  it("createFromProject 快照列/标签/字段/任务模板（标签 id 转名称）", async () => {
    const project = await seedProject("p1");
    const label = await labelService.create("u1", "p1", "前端");
    const task = await taskService.create("u1", {
      id: uuid(), projectId: "p1", title: "周报", status: "c1", labels: [label.id],
    });
    await taskTemplateService.createFromTask("u1", task, "周报模板");

    const tpl = await projectTemplateService.createFromProject("u1", project, "我的模板");
    expect(tpl.builtin).toBe(false);
    expect(tpl.columns).toEqual([
      { name: "待办", isDone: false }, { name: "进行中", isDone: false }, { name: "已完成", isDone: true },
    ]);
    expect(tpl.labels).toEqual([{ name: "前端", color: label.color }]);
    expect(tpl.customFields).toHaveLength(1);
    expect(tpl.taskTemplates).toHaveLength(1);
    expect(tpl.taskTemplates[0]!.labels).toEqual(["前端"]); // 存标签名而非 id
  });

  it("instantiate 按模板创建项目：新 id、成员角色、标签映射、任务模板落库", async () => {
    const project = await seedProject("p1");
    const label = await labelService.create("u1", "p1", "设计");
    const task = await taskService.create("u1", {
      id: uuid(), projectId: "p1", title: "评审", status: "c1", labels: [label.id],
    });
    await taskTemplateService.createFromTask("u1", task, "评审模板");
    const tpl = await projectTemplateService.createFromProject("u1", project, "快照");

    const created = await projectTemplateService.instantiate(tpl, "新项目", "u9");
    expect(created.id).not.toBe("p1");
    expect(created.name).toBe("新项目");
    expect(created.statusColumns.map((c) => c.name)).toEqual(["待办", "进行中", "已完成"]);
    expect(created.statusColumns.map((c) => c.order)).toEqual([0, 1, 2]);
    expect(created.memberRoles["u9"]).toBe("admin");
    expect(created.customFields[0]!.id).not.toBe("f1"); // 字段 id 重新生成

    const labels = await db.labels.where("projectId").equals(created.id).toArray();
    expect(labels.map((l) => l.name)).toEqual(["设计"]);

    const tpls = await db.taskTemplates.where("projectId").equals(created.id).toArray();
    expect(tpls).toHaveLength(1);
    expect(tpls[0]!.labels).toEqual([labels[0]!.id]); // 标签名映射回新 id
  });

  it("内置模板实例化（研发迭代）：列/标签/任务模板齐全", async () => {
    const list = await projectTemplateService.list("zh-CN");
    const rd = list.find((t) => t.id === "tpl-builtin-rd")!;
    const created = await projectTemplateService.instantiate(rd, "", "u1");
    expect(created.name).toBe("研发迭代"); // 留空回退模板名
    expect(created.statusColumns).toHaveLength(4);
    expect(created.statusColumns.filter((c) => c.isDone)).toHaveLength(1);
    const labels = await db.labels.where("projectId").equals(created.id).toArray();
    expect(labels).toHaveLength(4);
    const tpls = await db.taskTemplates.where("projectId").equals(created.id).toArray();
    expect(tpls).toHaveLength(2);
    expect(tpls[0]!.subtasks.length).toBeGreaterThan(0);
  });

  it("空白模板：两列起步", () => {
    const blank = blankTemplate("zh-CN");
    expect(blank.columns).toEqual([
      { name: "待办", isDone: false }, { name: "已完成", isDone: true },
    ]);
  });

  it("remove 拒绝内置 id，可删除已保存模板", async () => {
    await expect(projectTemplateService.remove("u1", "tpl-builtin-rd")).rejects.toThrow();
    const project = await seedProject("p1");
    const tpl = await projectTemplateService.createFromProject("u1", project, "待删");
    await projectTemplateService.remove("u1", tpl.id);
    expect(await db.projectTemplates.count()).toBe(0);
  });
});
