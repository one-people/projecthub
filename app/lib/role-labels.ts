import type { RoleId } from "~/auth/rbac";
import type { Dict } from "~/locales/zh-CN";

/** 角色 → i18n key（board/settings/projects 等页面共用） */
export const ROLE_LABEL_KEY: Record<RoleId, keyof Dict> = {
  admin: "roleAdmin",
  projectAdmin: "roleProjectAdmin",
  member: "roleMember",
  guest: "roleGuest",
};
