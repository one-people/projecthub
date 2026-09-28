export type Permission =
  | "project:delete"
  | "project:update"
  | "member:manage"
  | "label:manage"
  | "milestone:manage"
  | "automation:manage"
  | "template:manage"
  | "task:create"
  | "task:update"
  | "task:delete"
  | "task:read"
  | "comment:create";

/** 项目角色（Worktile 四级）：所有者由 project.ownerId 唯一标记，不在 memberRoles 取值内 */
export type RoleId = "owner" | "admin" | "member" | "guest";

/** memberRoles 的合法取值（owner 只经「移交所有权」变更） */
export type MemberRole = Exclude<RoleId, "owner">;

export interface Role {
  id: RoleId;
  name: string;
  permissions: Permission[];
}

/** admin 与 owner 共有的管理权限 */
const manage: Permission[] = [
  "project:update",
  "member:manage",
  "label:manage",
  "milestone:manage",
  "automation:manage",
  "template:manage",
  "task:create",
  "task:update",
  "task:delete",
  "task:read",
  "comment:create",
];

/** 普通成员的任务协作权限 */
const tasks: Permission[] = ["task:create", "task:update", "task:delete", "task:read", "comment:create"];

export const ROLES: Record<RoleId, Role> = {
  owner: { id: "owner", name: "所有者", permissions: ["project:delete", ...manage] },
  admin: { id: "admin", name: "管理员", permissions: manage },
  member: { id: "member", name: "成员", permissions: tasks },
  guest: { id: "guest", name: "只读访客", permissions: ["task:read"] },
};
