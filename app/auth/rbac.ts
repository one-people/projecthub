import { ROLES, type Permission, type RoleId } from "./roles";

export { ROLES };
export type { Permission, RoleId, MemberRole, Role } from "./roles";

export function can(roleId: RoleId, permission: Permission): boolean {
  return ROLES[roleId]?.permissions.includes(permission) ?? false;
}

/**
 * 角色解析唯一入口：ownerId 命中即所有者，否则查 memberRoles；
 * 非成员返回 null（不再默认 member）。
 */
export function resolveRole(
  project: { ownerId?: string; memberRoles: Record<string, string> },
  userId: string,
): RoleId | null {
  if (project.ownerId && project.ownerId === userId) return "owner";
  const role = project.memberRoles[userId];
  return role === "admin" || role === "member" || role === "guest" ? role : null;
}

/** 私有制可见性：项目仅对成员（含所有者）可见，非成员在列表/搜索/工作台一律过滤 */
export function isProjectVisible(
  project: { ownerId?: string; memberRoles: Record<string, string>; deletedAt?: string | null },
  userId: string,
): boolean {
  return !project.deletedAt && resolveRole(project, userId) !== null;
}
