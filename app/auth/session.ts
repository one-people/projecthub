import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { resolveRole, type RoleId } from "./rbac";
import type { User } from "~/models/user";

const SESSION_KEY = "currentUserId";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export const session = {
  async currentUser(): Promise<User> {
    const pref = await db.preferences.get(SESSION_KEY);
    if (pref) {
      const user = await db.users.get(pref.value as string);
      if (user) return user;
    }
    // 无会话：取第一个用户，库为空则创建默认本地用户
    let user = (await db.users.toCollection().first()) as User | undefined;
    if (!user) {
      user = {
        id: uuid(),
        name: "本地用户",
        email: "",
        active: true,
        avatarColor: COLORS[0]!,
        createdAt: new Date().toISOString(),
      };
      await db.users.add(user);
    }
    await db.preferences.put({ key: SESSION_KEY, value: user.id });
    return user;
  },

  async switchUser(userId: string): Promise<void> {
    await db.preferences.put({ key: SESSION_KEY, value: userId });
  },

  /** 当前身份在项目中的角色；非成员返回 null（可见性与鉴权统一走 resolveRole） */
  async roleIn(project: { ownerId?: string; memberRoles: Record<string, string> }): Promise<RoleId | null> {
    const user = await this.currentUser();
    return resolveRole(project, user.id);
  },
};

export async function seedUsers(names: string[]): Promise<User[]> {
  const existing = await db.users.toArray();
  const byName = new Map(existing.map((u) => [u.name, u]));
  const now = new Date().toISOString();
  const created: User[] = [];
  const users = names.map((name) => {
    const found = byName.get(name);
    if (found) return found;
    const user: User = {
      id: uuid(),
      name,
      email: "",
      active: true,
      avatarColor: COLORS[(existing.length + created.length) % COLORS.length]!,
      createdAt: now,
    };
    created.push(user);
    return user;
  });
  if (created.length > 0) await db.users.bulkAdd(created);
  return users;
}
