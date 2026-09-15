import { ROLES, type Permission, type RoleId } from "./roles";

export { ROLES };
export type { Permission, RoleId, Role } from "./roles";

export function can(roleId: RoleId, permission: Permission): boolean {
  return ROLES[roleId]?.permissions.includes(permission) ?? false;
}
