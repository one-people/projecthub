export type Permission =
  | "user:manage"
  | "project:create"
  | "project:delete"
  | "project:update"
  | "task:create"
  | "task:update"
  | "task:delete"
  | "task:read"
  | "comment:create";

export type RoleId = "admin" | "projectAdmin" | "member" | "guest";

export interface Role {
  id: RoleId;
  name: string;
  permissions: Permission[];
}

const all: Permission[] = [
  "user:manage",
  "project:create",
  "project:delete",
  "project:update",
  "task:create",
  "task:update",
  "task:delete",
  "task:read",
  "comment:create",
];

export const ROLES: Record<RoleId, Role> = {
  admin: { id: "admin", name: "管理员", permissions: all },
  projectAdmin: {
    id: "projectAdmin",
    name: "项目管理员",
    permissions: ["project:update", "task:create", "task:update", "task:delete", "task:read", "comment:create"],
  },
  member: {
    id: "member",
    name: "成员",
    permissions: ["task:create", "task:update", "task:delete", "task:read", "comment:create"],
  },
  guest: { id: "guest", name: "只读访客", permissions: ["task:read"] },
};
