import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { t } from "~/lib/i18n";
import { userSchema, type User } from "~/models/user";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

/** 全局用户管理：新建本地用户 / 删除用户并清理所有引用 */
export const userService = {
  async create(name: string): Promise<User> {
    const trimmed = name.trim().slice(0, 50);
    if (!trimmed) throw new Error(t("errNameRequired"));
    const count = await db.users.count();
    const user = userSchema.parse({
      id: uuid(),
      name: trimmed,
      email: "",
      avatarColor: COLORS[count % COLORS.length]!,
      createdAt: new Date().toISOString(),
    });
    await db.users.add(user);
    return user;
  },

  async remove(userId: string): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) throw new Error(t("userNotFound"));
    if ((await db.users.count()) <= 1) throw new Error(t("errLastUser"));
    const activeProjects = (await db.projects.toArray()).filter((p) => !p.deletedAt);
    const owned = activeProjects.filter((p) => p.ownerId === userId);
    if (owned.length > 0) throw new Error(t("errUserOwnsProjects", { count: owned.length }));

    await db.transaction(
      "rw",
      [db.projects, db.tasks, db.automations, db.comments, db.users, db.preferences],
      async () => {
        for (const project of activeProjects) {
          if (!project.memberRoles[userId]) continue;
          const memberRoles = { ...project.memberRoles };
          delete memberRoles[userId];
          await db.projects.update(project.id, { memberRoles });
        }
        await db.tasks
          .where("assigneeId")
          .equals(userId)
          .modify({ assigneeId: null });
        // 指派给该用户的自动化规则失效，直接移除
        const deadRules = (await db.automations.toArray()).filter(
          (rule) => rule.action.type === "assign" && rule.action.value === userId,
        );
        await db.automations.bulkDelete(deadRules.map((rule) => rule.id));
        // 评论保留（作者显示为"未知用户"），仅清掉 @ 提及
        await db.comments
          .filter((c) => c.mentions.includes(userId))
          .modify((c) => {
            c.mentions = c.mentions.filter((m) => m !== userId);
          });
        await db.users.delete(userId);
        // 若删的是当前身份，清除会话标记，currentUser() 会回落到第一个用户
        const pref = await db.preferences.get("currentUserId");
        if (pref?.value === userId) await db.preferences.delete("currentUserId");
      },
    );
  },
};
