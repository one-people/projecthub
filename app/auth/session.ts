import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { RoleId } from "./rbac";
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

  async roleIn(project: { memberRoles: Record<string, string> }): Promise<RoleId> {
    const user = await this.currentUser();
    return (project.memberRoles[user.id] as RoleId) ?? "member";
  },
};

export async function seedUsers(names: string[]): Promise<User[]> {
  const now = new Date().toISOString();
  const users = names.map((name, i) => ({
    id: uuid(),
    name,
    avatarColor: COLORS[i % COLORS.length]!,
    createdAt: now,
  }));
  await db.users.bulkAdd(users);
  return users;
}
