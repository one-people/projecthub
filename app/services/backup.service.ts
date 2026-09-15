import { z } from "zod";
import { db } from "~/repositories/db";
import { taskSchema } from "~/models/task";
import { projectSchema } from "~/models/project";
import { commentSchema } from "~/models/comment";
import { userSchema } from "~/models/user";
import { notificationSchema } from "~/models/notification";

export const BACKUP_VERSION = 1;

const backupSchema = z.object({
  app: z.literal("projecthub"),
  schemaVersion: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.object({
    projects: z.array(projectSchema),
    tasks: z.array(taskSchema),
    comments: z.array(commentSchema),
    notifications: z.array(notificationSchema),
    users: z.array(userSchema),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

export const backupService = {
  async exportAll(): Promise<string> {
    const [projects, tasks, comments, notifications, users] = await Promise.all([
      db.projects.toArray(),
      db.tasks.toArray(),
      db.comments.toArray(),
      db.notifications.toArray(),
      db.users.toArray(),
    ]);
    return JSON.stringify(
      {
        app: "projecthub",
        schemaVersion: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tables: { projects, tasks, comments, notifications, users },
      } satisfies Backup,
      null,
      2,
    );
  },

  // 导入前全量 Zod 校验，任一记录非法即整包拒绝，事务内原子写入
  async importAll(jsonText: string): Promise<{ imported: number }> {
    const parsed = backupSchema.parse(JSON.parse(jsonText));
    const { projects, tasks, comments, notifications, users } = parsed.tables;
    const count =
      projects.length + tasks.length + comments.length + notifications.length + users.length;
    if (count > 100_000) throw new Error("备份记录数超出上限（100000）");
    await db.transaction(
      "rw",
      [db.projects, db.tasks, db.comments, db.notifications, db.users],
      async () => {
        await db.projects.bulkPut(projects);
        await db.tasks.bulkPut(tasks);
        await db.comments.bulkPut(comments);
        await db.notifications.bulkPut(notifications);
        await db.users.bulkPut(users);
      },
    );
    return { imported: count };
  },

  async downloadBackup() {
    const blob = new Blob([await this.exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projecthub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
