import type { RoleId } from "~/auth/rbac";
import type { Dict } from "~/locales/zh-CN";

/** 角色 → i18n key（board/settings/projects 等页面共用） */
export const ROLE_LABEL_KEY: Record<RoleId, keyof Dict> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
  guest: "roleGuest",
};
