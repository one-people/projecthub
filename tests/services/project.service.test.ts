import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { projectService } from "~/services/project.service";
import { resolveRole } from "~/auth/rbac";
import type { Project, StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";

const OWNER = "u-owner";
const ADMIN = "u-admin";
const MEMBER = "u-member";
const GUEST = "u-guest";
const OUTSIDER = "u-outsider";

const now = new Date().toISOString();
let project: Project;

const C1: StatusColumn = { id: "c1", name: "待办", isDone: false, order: 0 };
const C2: StatusColumn = { id: "c2", name: "进行中", isDone: false, order: 1 };
const C3: StatusColumn = { id: "c3", name: "已完成", isDone: true, order: 2 };

async function seedTask(overrides: Partial<Task> = {}): Promise<Task> {
  const task: Task = {
    id: overrides.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    projectId: project.id,
    parentId: null,
    title: "任务",
    descriptionRich: null,
    status: C1.id,
    assigneeId: null,
    startDate: null,
    dueDate: null,
    customValues: {},
    priority: "none",
    labels: [],
    subtasks: [],
    recurrence: "none",
    order: "a0",
    archived: false,
    completedAt: null,
    deletedAt: null,
    deletedByProjectId: null, deletedByParentTaskId: null,
    createdAt: now,
    updatedAt: now,
    version: 0,
    ...overrides,
  };
  await db.tasks.add(task);
  return task;
}

beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.tasks.clear(),
    db.users.clear(),
  ]);
  project = {
    id: "p1",
    name: "源项目",
    description: "",
    statusColumns: [C1, C2, C3],
    customFields: [
      { id: "f1", name: "Story Points", type: "number", options: [] },
      { id: "f2", name: "模块", type: "select", options: ["前端", "后端"] },
    ],
    ownerId: OWNER,
    memberRoles: { [OWNER]: "admin", [ADMIN]: "admin", [MEMBER]: "member", [GUEST]: "guest" },
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
  await db.projects.add(project);
});

describe("projectService.updateBasic", () => {
  it("admin 可改名并落库", async () => {
    await projectService.updateBasic("p1", ADMIN, { name: " 新名称 ", description: "d" });
    const row = (await db.projects.get("p1"))!;
    expect(row.name).toBe("新名称");
    expect(row.description).toBe("d");
  });

  it("member / 非成员无 project:update 被拒", async () => {
    await expect(projectService.updateBasic("p1", MEMBER, { name: "x" })).rejects.toThrow(/权限/);
    await expect(projectService.updateBasic("p1", OUTSIDER, { name: "x" })).rejects.toThrow(/权限/);
  });

  it("空名被拒", async () => {
    await expect(projectService.updateBasic("p1", OWNER, { name: "  " })).rejects.toThrow();
  });
});

describe("projectService.updateColumns", () => {
  it("删除列时任务回退首列并清 completedAt", async () => {
    const done = await seedTask({ status: C3.id, completedAt: now });
    await seedTask({ status: C1.id });
    await projectService.updateColumns("p1", ADMIN, [C1, C2]);
    const moved = (await db.tasks.get(done.id))!;
    expect(moved.status).toBe(C1.id);
    expect(moved.completedAt).toBeNull();
    const row = (await db.projects.get("p1"))!;
    expect(row.statusColumns).toHaveLength(2);
  });

  it("回退到完成列时补记 completedAt", async () => {
    const open = await seedTask({ status: C1.id });
    await projectService.updateColumns("p1", ADMIN, [C3]);
    const moved = (await db.tasks.get(open.id))!;
    expect(moved.status).toBe(C3.id);
    expect(moved.completedAt).not.toBeNull();
  });

  it("空列 / 空名列被拒；member 被拒", async () => {
    await expect(projectService.updateColumns("p1", OWNER, [])).rejects.toThrow();
    await expect(
      projectService.updateColumns("p1", OWNER, [{ id: "c1", name: " ", isDone: false, order: 0 }]),
    ).rejects.toThrow();
    await expect(projectService.updateColumns("p1", MEMBER, [C1, C2, C3])).rejects.toThrow(/权限/);
  });
});

describe("projectService.updateFields", () => {
  it("删除字段时从事务内剥离任务值", async () => {
    await seedTask({ customValues: { f1: 5, f2: "前端" } });
    await projectService.updateFields("p1", ADMIN, [
      { id: "f2", name: "模块", type: "select", options: ["前端", "后端"] },
    ]);
    const task = (await db.tasks.where("projectId").equals("p1").toArray())[0]!;
    expect(task.customValues).toEqual({ f2: "前端" });
    expect(((await db.projects.get("p1"))!.customFields)).toHaveLength(1);
  });

  it("member 被拒", async () => {
    await expect(projectService.updateFields("p1", MEMBER, [])).rejects.toThrow(/权限/);
  });
});

describe("projectService.addMember", () => {
  it("admin 可加 member/guest，重复添加被拒", async () => {
    await projectService.addMember("p1", ADMIN, "u-new", "guest");
    await projectService.addMember("p1", ADMIN, "u-new2");
    const row = (await db.projects.get("p1"))!;
    expect(row.memberRoles["u-new"]).toBe("guest");
    expect(row.memberRoles["u-new2"]).toBe("member");
    await expect(projectService.addMember("p1", ADMIN, "u-new")).rejects.toThrow();
  });

  it("admin 不能直接添加 admin（仅所有者）", async () => {
    await expect(projectService.addMember("p1", ADMIN, "u-new", "admin")).rejects.toThrow(/所有者/);
    await projectService.addMember("p1", OWNER, "u-new", "admin");
    expect((await db.projects.get("p1"))!.memberRoles["u-new"]).toBe("admin");
  });

  it("member / 非成员无 member:manage 被拒", async () => {
    await expect(projectService.addMember("p1", MEMBER, "u-new")).rejects.toThrow(/权限/);
    await expect(projectService.addMember("p1", OUTSIDER, "u-new")).rejects.toThrow(/权限/);
  });
});

describe("projectService.removeMember", () => {
  it("所有者不可被移除", async () => {
    await expect(projectService.removeMember("p1", OWNER, OWNER)).rejects.toThrow(/所有者/);
    await expect(projectService.removeMember("p1", ADMIN, OWNER)).rejects.toThrow(/所有者/);
  });

  it("admin 不能移除其他 admin；所有者可以；admin 可自行退出", async () => {
    const otherAdmin = "u-admin2";
    await projectService.addMember("p1", OWNER, otherAdmin, "admin");
    await expect(projectService.removeMember("p1", ADMIN, otherAdmin)).rejects.toThrow(/所有者/);
    await projectService.removeMember("p1", OWNER, otherAdmin);
    expect((await db.projects.get("p1"))!.memberRoles[otherAdmin]).toBeUndefined();
    // admin 自行退出无需所有者批准
    await projectService.removeMember("p1", ADMIN, ADMIN);
    expect((await db.projects.get("p1"))!.memberRoles[ADMIN]).toBeUndefined();
  });

  it("admin 可移除 member/guest；非成员目标被拒", async () => {
    await projectService.removeMember("p1", ADMIN, GUEST);
    expect((await db.projects.get("p1"))!.memberRoles[GUEST]).toBeUndefined();
    await expect(projectService.removeMember("p1", ADMIN, "u-ghost")).rejects.toThrow(/成员/);
  });

  it("member 无 member:manage 不能移除他人，但可自行退出（所有者除外）", async () => {
    await expect(projectService.removeMember("p1", MEMBER, GUEST)).rejects.toThrow(/权限/);
    await projectService.removeMember("p1", MEMBER, MEMBER);
    expect((await db.projects.get("p1"))!.memberRoles[MEMBER]).toBeUndefined();
    // admin 自行退出也无需 owner（不触碰他人）
    await projectService.removeMember("p1", ADMIN, ADMIN);
    expect((await db.projects.get("p1"))!.memberRoles[ADMIN]).toBeUndefined();
  });
});

describe("projectService.setMemberRole", () => {
  it("不能改自己的角色；不能改所有者的角色", async () => {
    await expect(projectService.setMemberRole("p1", ADMIN, ADMIN, "member")).rejects.toThrow(/自己/);
    await expect(projectService.setMemberRole("p1", ADMIN, OWNER, "member")).rejects.toThrow(/所有者/);
  });

  it("admin 只能在 member/guest 间调整", async () => {
    await projectService.setMemberRole("p1", ADMIN, MEMBER, "guest");
    expect((await db.projects.get("p1"))!.memberRoles[MEMBER]).toBe("guest");
    await projectService.setMemberRole("p1", ADMIN, GUEST, "member");
    expect((await db.projects.get("p1"))!.memberRoles[GUEST]).toBe("member");
  });

  it("涉及 admin 的升降仅限所有者", async () => {
    await expect(projectService.setMemberRole("p1", ADMIN, MEMBER, "admin")).rejects.toThrow(/所有者/);
    const otherAdmin = "u-admin2";
    await projectService.addMember("p1", OWNER, otherAdmin, "admin");
    await expect(projectService.setMemberRole("p1", ADMIN, otherAdmin, "member")).rejects.toThrow(/所有者/);
    await projectService.setMemberRole("p1", OWNER, MEMBER, "admin");
    expect((await db.projects.get("p1"))!.memberRoles[MEMBER]).toBe("admin");
    await projectService.setMemberRole("p1", OWNER, MEMBER, "member");
  });

  it("非成员目标与外部操作者被拒", async () => {
    await expect(projectService.setMemberRole("p1", OWNER, "u-ghost", "admin")).rejects.toThrow(/成员/);
    await expect(projectService.setMemberRole("p1", OUTSIDER, MEMBER, "guest")).rejects.toThrow(/权限/);
  });
});

describe("projectService.transferOwnership", () => {
  it("仅所有者可移交；移交后原所有者降为 admin", async () => {
    await expect(projectService.transferOwnership("p1", ADMIN, MEMBER)).rejects.toThrow(/权限/);
    await projectService.transferOwnership("p1", OWNER, MEMBER);
    const row = (await db.projects.get("p1"))!;
    expect(row.ownerId).toBe(MEMBER);
    expect(row.memberRoles[MEMBER]).toBe("admin");
    expect(row.memberRoles[OWNER]).toBe("admin");
    expect(resolveRole(row, OWNER)).toBe("admin");
    expect(resolveRole(row, MEMBER)).toBe("owner");
  });

  it("目标必须是现有成员；移交给自己是 no-op", async () => {
    await expect(projectService.transferOwnership("p1", OWNER, OUTSIDER)).rejects.toThrow(/成员/);
    await projectService.transferOwnership("p1", OWNER, OWNER);
    expect((await db.projects.get("p1"))!.ownerId).toBe(OWNER);
  });
});

describe("projectService.createMemberUser", () => {
  it("admin 内联新建用户并加入为 member", async () => {
    const userId = await projectService.createMemberUser("p1", ADMIN, " 新同事 ");
    const user = (await db.users.get(userId))!;
    expect(user.name).toBe("新同事");
    expect((await db.projects.get("p1"))!.memberRoles[userId]).toBe("member");
  });

  it("空名被拒；member 无 member:manage 被拒", async () => {
    await expect(projectService.createMemberUser("p1", ADMIN, "  ")).rejects.toThrow();
    await expect(projectService.createMemberUser("p1", MEMBER, "新同事")).rejects.toThrow(/权限/);
  });
});
