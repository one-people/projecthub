import { db } from "~/repositories/db";
import { broadcastChange } from "~/repositories/broadcast";
import { uuid } from "~/lib/id";
import type { Notification, NotificationType } from "~/models/notification";

export interface NotifyInput {
  userId: string; // 接收者
  actorId: string; // 触发者
  type: NotificationType;
  taskId: string | null;
  taskTitle: string;
}

export const notificationService = {
  async notify(input: NotifyInput): Promise<void> {
    if (input.userId === input.actorId) return; // 不通知操作者本人

    const now = new Date().toISOString();
    // 去重合并：同一接收者 + 类型 + 任务的未读通知累加计数
    // 注：IndexedDB 的 boolean 索引不可靠，按 userId 查询后内存过滤
    const existing = (
      await db.notifications.where("userId").equals(input.userId).toArray()
    ).filter((n) => !n.read);
    const dup = existing.find(
      (n) => n.type === input.type && n.payload.taskId === input.taskId,
    );

    if (dup) {
      const next: Notification = {
        ...dup,
        payload: { ...dup.payload, count: dup.payload.count + 1 },
        updatedAt: now,
      };
      await db.notifications.put(next);
    } else {
      await db.notifications.add({
        id: uuid(),
        userId: input.userId,
        type: input.type,
        payload: {
          taskId: input.taskId,
          taskTitle: input.taskTitle,
          actorId: input.actorId,
          count: 1,
        },
        read: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    broadcastChange({ table: "notifications", ids: [input.userId] });
  },

  async list(userId: string): Promise<Notification[]> {
    const rows = await db.notifications.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
  },

  async unreadCount(userId: string): Promise<number> {
    const rows = await db.notifications.where("userId").equals(userId).toArray();
    return rows.filter((n) => !n.read).length;
  },

  async markAllRead(userId: string): Promise<void> {
    const unread = (
      await db.notifications.where("userId").equals(userId).toArray()
    ).filter((n) => !n.read);
    await Promise.all(
      unread.map((n) => db.notifications.put({ ...n, read: true })),
    );
  },
};
