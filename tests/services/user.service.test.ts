import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { userService } from "~/services/user.service";
import { session } from "~/auth/session";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";
import type { Comment } from "~/models/comment";
import type { Automation } from "~/models/automation";
import type { User } from "~/models/user";

const OWNER = "u-owner";
const VICTIM = "u-victim"; // 待删除用户
const OTHER = "u-other";

const now = new Date().toISOString();

function user(id: string, name: string): User {
  return { id, name, email: "", avatarColor: "#3B82F6", active: true, createdAt: now };
}

async function seedProject(overrides: Partial<Project> = {}): Promise<Project> {
  const project: Project = {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
    name: "项目",
    description: "",
    statusColumns: [
      { id: "c1", name: "待办", isDone: false, order: 0 },
      { id: "c2", name: "完成", isDone: true, order: 1 },
    ],
    customFields: [],
    ownerId: OWNER,
    memberRoles: { [VICTIM]: "member" },
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 0,
    ...overrides,
  };
  await db.projects.add(project);
  return project;
}

async function seedTask(projectId: string, overrides: Partial<Task> = {}): Promise<Task> {
  const task: Task = {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    title: "任务",
    descriptionRich: null,
    status: "c1",
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
    deletedByProjectId: null,
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
    db.comments.clear(),
    db.automations.clear(),
    db.preferences.clear(),
  ]);
  await db.users.bulkAdd([user(OWNER, "甲"), user(VICTIM, "乙"), user(OTHER, "丙")]);
});

describe("userService.create", () => {
  it("创建用户：裁剪空白、头像色循环", async () => {
    const u1 = await userService.create("  张三  ");
    expect(u1.name).toBe("张三");
    expect(u1.avatarColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(await db.users.get(u1.id)).toBeTruthy();
  });

  it("空白姓名被拒", async () => {
    await expect(userService.create("   ")).rejects.toThrow(/姓名/);
  });
});

describe("userService.remove", () => {
  it("清理成员角色、任务指派、指派自动化与 @ 提及", async () => {
    const p = await seedProject();
    const t = await seedTask(p.id, { assigneeId: VICTIM });
    await seedTask(p.id, { assigneeId: OTHER });
    await db.automations.add({
      id: "a1",
      projectId: p.id,
      name: "指派乙",
      enabled: true,
      trigger: { type: "task_created", columnId: null },
      action: { type: "assign", value: VICTIM },
      createdAt: now,
    } satisfies Automation);
    await db.automations.add({
      id: "a2",
      projectId: p.id,
      name: "置优先级",
      enabled: true,
      trigger: { type: "task_created", columnId: null },
      action: { type: "set_priority", value: "high" },
      createdAt: now,
    } satisfies Automation);
    await db.comments.add({
      id: "cm1",
      taskId: t.id,
      authorId: VICTIM,
      contentRich: null,
      mentions: [VICTIM, OTHER],
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 0,
    } as Comment);

    await userService.remove(VICTIM);

    expect(await db.users.get(VICTIM)).toBeUndefined();
    // 成员角色被移除
    expect((await db.projects.get(p.id))!.memberRoles[VICTIM]).toBeUndefined();
    // 指派清空，他人指派保留
    expect((await db.tasks.get(t.id))!.assigneeId).toBeNull();
    expect((await db.tasks.where("assigneeId").equals(OTHER).count())).toBe(1);
    // 指派类自动化删除，其他规则保留
    expect(await db.automations.get("a1")).toBeUndefined();
    expect(await db.automations.get("a2")).toBeTruthy();
    // 评论保留，仅清理提及
    const cm = (await db.comments.get("cm1"))!;
    expect(cm.authorId).toBe(VICTIM);
    expect(cm.mentions).toEqual([OTHER]);
  });

  it("项目所有者不可删除", async () => {
    await seedProject({ ownerId: VICTIM });
    await expect(userService.remove(VICTIM)).rejects.toThrow(/所有者/);
  });

  it("最后一个用户不可删除", async () => {
    await userService.remove(VICTIM);
    await userService.remove(OTHER);
    await expect(userService.remove(OWNER)).rejects.toThrow(/至少/);
  });

  it("删除当前身份后会话回落", async () => {
    await session.switchUser(VICTIM);
    expect((await session.currentUser()).id).toBe(VICTIM);
    await userService.remove(VICTIM);
    const me = await session.currentUser();
    expect(me.id).not.toBe(VICTIM);
  });

  it("删除不存在的用户报错", async () => {
    await expect(userService.remove("u-ghost")).rejects.toThrow(/不存在/);
  });
});
