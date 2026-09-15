import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { can, type RoleId } from "~/auth/rbac";
import { auditService } from "./audit.service";
import type { User } from "~/models/user";

class PermissionError extends Error {}

function assert(role: RoleId) {
  if (!can(role, "user:manage")) {
    throw new PermissionError("仅管理员可管理用户");
  }
}

export interface UserFormInput {
  name: string;
  email: string;
  avatarColor: string;
}

export const userService = {
  async list(): Promise<User[]> {
    return db.users.orderBy("createdAt").toArray();
  },

  async create(actorId: string, actorRole: RoleId, input: UserFormInput): Promise<User> {
    assert(actorRole);
    const user: User = {
      id: uuid(),
      name: input.name.trim(),
      email: input.email.trim(),
      avatarColor: input.avatarColor,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await db.users.add(user);
    await auditService.log(actorId, "create", "user", user.id, `创建了用户「${user.name}」`);
    return user;
  },

  async update(actorId: string, actorRole: RoleId, id: string, patch: Partial<UserFormInput>): Promise<void> {
    assert(actorRole);
    const user = await db.users.get(id);
    if (!user) return;
    await db.users.update(id, patch);
    await auditService.log(actorId, "update", "user", id, `更新了用户「${user.name}」`);
  },

  async deactivate(actorId: string, actorRole: RoleId, id: string): Promise<void> {
    assert(actorRole);
    const user = await db.users.get(id);
    if (!user) return;
    await db.users.update(id, { active: !user.active });
    await auditService.log(
      actorId,
      "update",
      "user",
      id,
      user.active ? `停用了用户「${user.name}」` : `启用了用户「${user.name}」`,
    );
  },
};
