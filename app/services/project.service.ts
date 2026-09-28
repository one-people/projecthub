import { db } from "~/repositories/db";
import type { MemberRole } from "~/auth/rbac";
import { resolveRole } from "~/auth/rbac";
import { assertProjectPermission, assertRole } from "~/auth/assert";
import { statusColumnSchema, customFieldSchema, type StatusColumn, type CustomField } from "~/models/project";
import { t } from "~/lib/i18n";
import { uuid } from "~/lib/id";

/**
 * 项目配置与成员管理（服务层收口：设置页不再直写 db.projects）。
 * 角色一律由 assertProjectPermission / resolveRole 在服务内解析，调用方无法伪造。
 */
export const projectService = {
  /** 更新基本信息（名称 1–100 字符） */
  async updateBasic(
    projectId: string,
    actorId: string,
    patch: { name: string; description?: string },
  ): Promise<void> {
    const project = await assertProjectPermission(projectId, actorId, "project:update");
    const name = patch.name.trim();
    if (!name || name.length > 100) throw new Error(t("errNameRequired"));
    await db.projects.update(project.id, {
      name,
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      updatedAt: new Date().toISOString(),
    });
  },

  /** 整包替换状态列（新增/改名/完成标记/排序/删除都由调用方计算好数组） */
  async updateColumns(projectId: string, actorId: string, columns: StatusColumn[]): Promise<void> {
    const project = await assertProjectPermission(projectId, actorId, "project:update");
    const clean = columns.map((c) => statusColumnSchema.parse(c));
    if (clean.length === 0) throw new Error(t("errColumnsRequired"));
    const ids = new Set(clean.map((c) => c.id));
    if (ids.size !== clean.length) throw new Error(t("errColumnsRequired"));
    for (const c of clean) {
      if (!c.name.trim()) throw new Error(t("errColumnsRequired"));
    }
    // 删除列时，该列任务移回第一个未删除列，完成态口径与新列对齐
    const removed = project.statusColumns.filter((c) => !ids.has(c.id));
    await db.transaction("rw", db.projects, db.tasks, async () => {
      await db.projects.update(project.id, {
        statusColumns: clean,
        updatedAt: new Date().toISOString(),
      });
      if (removed.length > 0) {
        const fallback = [...clean].sort((a, b) => a.order - b.order)[0]!;
        await db.tasks
          .where("projectId")
          .equals(project.id)
          .filter((task) => !ids.has(task.status))
          .modify((task) => {
            const wasDone = removed.find((c) => c.id === task.status)?.isDone ?? false;
            task.status = fallback.id;
            if (wasDone && !fallback.isDone) task.completedAt = null;
            else if (!wasDone && fallback.isDone && !task.completedAt) {
              task.completedAt = new Date().toISOString();
            }
          });
      }
    });
  },

  /** 整包替换自定义字段；被删除字段的值从事务内所有任务剥离 */
  async updateFields(projectId: string, actorId: string, fields: CustomField[]): Promise<void> {
    const project = await assertProjectPermission(projectId, actorId, "project:update");
    const clean = fields.map((f) => customFieldSchema.parse(f));
    const nextIds = new Set(clean.map((f) => f.id));
    const removedIds = (project.customFields ?? []).filter((f) => !nextIds.has(f.id)).map((f) => f.id);
    await db.transaction("rw", [db.projects, db.tasks], async () => {
      await db.projects.update(project.id, {
        customFields: clean,
        updatedAt: new Date().toISOString(),
      });
      if (removedIds.length > 0) {
        await db.tasks
          .where("projectId")
          .equals(project.id)
          .filter((task) => removedIds.some((id) => (task.customValues ?? {})[id] !== undefined))
          .modify((task) => {
            const values = { ...(task.customValues ?? {}) };
            for (const id of removedIds) delete values[id];
            task.customValues = values;
          });
      }
    });
  },

  /** 添加成员（默认成员角色；admin 角色需所有者通过 setMemberRole 提升） */
  async addMember(projectId: string, actorId: string, userId: string, role: MemberRole = "member"): Promise<void> {
    const project = await assertProjectPermission(projectId, actorId, "member:manage");
    if (role === "admin") this.assertOwner(project, actorId, t("errAdminChangeOwnerOnly"));
    if (project.memberRoles[userId]) throw new Error(t("errAlreadyMember"));
    const memberRoles: Record<string, MemberRole> = { ...project.memberRoles, [userId]: role };
    await db.projects.update(project.id, { memberRoles, updatedAt: new Date().toISOString() });
  },

  /**
   * 移除成员：所有者不可移除；移除他人需 member:manage，且移除 admin 仅限所有者；
   * 自行退出无需 member:manage（所有者除外，需先移交）。
   */
  async removeMember(projectId: string, actorId: string, userId: string): Promise<void> {
    const project = await db.projects.get(projectId);
    if (!project) throw new Error(t("projectNotFound"));
    const self = userId === actorId;
    if (!self) assertRole(resolveRole(project, actorId), "member:manage");
    if (userId === project.ownerId) throw new Error(t("errCannotRemoveOwner"));
    const targetRole = project.memberRoles[userId];
    if (!targetRole) throw new Error(t("errNotMember"));
    if (!self && targetRole === "admin") this.assertOwner(project, actorId, t("errAdminChangeOwnerOnly"));
    const memberRoles: Record<string, MemberRole> = { ...project.memberRoles };
    delete memberRoles[userId];
    await db.projects.update(project.id, { memberRoles, updatedAt: new Date().toISOString() });
  },

  /**
   * 调整成员角色：不能改自己的角色；所有者角色经「移交所有权」变更；
   * 涉及 admin 的升降（from 或 to）仅限所有者。
   */
  async setMemberRole(projectId: string, actorId: string, userId: string, nextRole: MemberRole): Promise<void> {
    const project = await assertProjectPermission(projectId, actorId, "member:manage");
    if (userId === actorId) throw new Error(t("errCannotChangeOwnRole"));
    if (userId === project.ownerId) throw new Error(t("errCannotRemoveOwner"));
    const currentRole = project.memberRoles[userId];
    if (!currentRole) throw new Error(t("errNotMember"));
    if (currentRole === "admin" || nextRole === "admin") {
      this.assertOwner(project, actorId, t("errAdminChangeOwnerOnly"));
    }
    const memberRoles: Record<string, MemberRole> = { ...project.memberRoles, [userId]: nextRole };
    await db.projects.update(project.id, { memberRoles, updatedAt: new Date().toISOString() });
  },

  /** 移交所有权：目标必须是现有成员；原所有者降为管理员 */
  async transferOwnership(projectId: string, actorId: string, nextOwnerId: string): Promise<void> {
    const project = await assertProjectPermission(projectId, actorId, "project:delete");
    if (nextOwnerId === project.ownerId) return;
    if (!project.memberRoles[nextOwnerId]) throw new Error(t("errNotMember"));
    const memberRoles: Record<string, MemberRole> = {
      ...project.memberRoles,
      [nextOwnerId]: "admin",
      [project.ownerId || actorId]: "admin",
    };
    await db.projects.update(project.id, {
      ownerId: nextOwnerId,
      memberRoles,
      updatedAt: new Date().toISOString(),
    });
  },

  /** 内联新建本地用户并加入项目（成员来源：设置 → 成员页） */
  async createMemberUser(projectId: string, actorId: string, name: string): Promise<string> {
    await assertProjectPermission(projectId, actorId, "member:manage");
    const trimmed = name.trim().slice(0, 50);
    if (!trimmed) throw new Error(t("errNameRequired"));
    const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
    const existing = await db.users.count();
    const userId = uuid();
    await db.users.add({
      id: userId,
      name: trimmed,
      email: "",
      active: true,
      avatarColor: COLORS[existing % COLORS.length]!,
      createdAt: new Date().toISOString(),
    });
    await this.addMember(projectId, actorId, userId, "member");
    return userId;
  },

  assertOwner(project: { ownerId?: string }, actorId: string, message: string): void {
    if (project.ownerId !== actorId) throw new Error(message);
  },
};
