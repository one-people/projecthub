import { db } from "~/repositories/db";
import { can, resolveRole, type Permission, type RoleId } from "~/auth/rbac";
import { t } from "~/lib/i18n";
import type { Project } from "~/models/project";

/** 服务层统一鉴权错误（消息走 i18n；role 为 null 表示非成员） */
export class PermissionError extends Error {
  constructor(
    public readonly role: RoleId | null,
    public readonly permission: Permission,
  ) {
    super(t("noPermission"));
    this.name = "PermissionError";
  }
}

export function assertRole(role: RoleId | null, permission: Permission): void {
  if (!role || !can(role, permission)) throw new PermissionError(role, permission);
}

/** 按项目解析角色并断言权限，返回项目行（服务层唯一鉴权入口，不再信任调用方传入的角色） */
export async function assertProjectPermission(
  projectId: string,
  actorId: string,
  permission: Permission,
): Promise<Project> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(t("projectNotFound"));
  assertRole(resolveRole(project, actorId), permission);
  return project;
}
