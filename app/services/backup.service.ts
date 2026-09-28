import { z } from "zod";
import { db } from "~/repositories/db";
import { taskSchema } from "~/models/task";
import { projectSchema } from "~/models/project";
import { commentSchema } from "~/models/comment";
import { userSchema } from "~/models/user";
import { labelSchema } from "~/models/label";

export const BACKUP_VERSION = 4;

const backupSchema = z.object({
  app: z.literal("projecthub"),
  schemaVersion: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.object({
    projects: z.array(projectSchema),
    tasks: z.array(taskSchema),
    comments: z.array(commentSchema),
    users: z.array(userSchema),
    labels: z.array(labelSchema).default([]),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

/** 旧版备份项目行归一化：projectAdmin → admin，缺失 ownerId 时回填（首位 admin，无则首个成员） */
function normalizeProjectRows(rows: unknown): unknown {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const r = row as Record<string, unknown>;
    const roles = (r.memberRoles && typeof r.memberRoles === "object" ? r.memberRoles : {}) as Record<string, string>;
    for (const [uid, v] of Object.entries(roles)) {
      if (v === "projectAdmin" || v === "owner") roles[uid] = "admin";
    }
    r.memberRoles = roles;
    if (typeof r.ownerId !== "string" || !r.ownerId) {
      const entries = Object.entries(roles);
      const admin = entries.find(([, v]) => v === "admin");
      r.ownerId = admin ? admin[0] : (entries[0]?.[0] ?? "");
    }
    return r;
  });
}

export const backupService = {
  async exportAll(): Promise<string> {
    const [projects, tasks, comments, users, labels] = await Promise.all([
      db.projects.toArray(),
      db.tasks.toArray(),
      db.comments.toArray(),
      db.users.toArray(),
      db.labels.toArray(),
    ]);
    return JSON.stringify(
      {
        app: "projecthub",
        schemaVersion: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tables: { projects, tasks, comments, users, labels },
      } satisfies Backup,
      null,
      2,
    );
  },

  // 导入前全量 Zod 校验，任一记录非法即整包拒绝，事务内原子写入。
  // v1 备份中的 notifications 表已被移除，导入时直接忽略。
  // v3 及更早备份的 projects 无 ownerId（可能含 projectAdmin 角色），导入时归一化。
  async importAll(jsonText: string): Promise<{ imported: number }> {
    const raw = JSON.parse(jsonText) as Record<string, unknown>;
    if (raw && typeof raw === "object" && raw.tables && typeof raw.tables === "object") {
      const tables = raw.tables as Record<string, unknown>;
      delete tables.notifications;
      delete tables.auditLogs;
      tables.projects = normalizeProjectRows(tables.projects);
    }
    const parsed = backupSchema.parse(raw);
    const { projects, tasks, comments, users, labels } = parsed.tables;
    const count = projects.length + tasks.length + comments.length + users.length + labels.length;
    if (count > 100_000) throw new Error("备份记录数超出上限（100000）");
    await db.transaction("rw", [db.projects, db.tasks, db.comments, db.users, db.labels], async () => {
      await db.projects.bulkPut(projects);
      await db.tasks.bulkPut(tasks);
      await db.comments.bulkPut(comments);
      await db.users.bulkPut(users);
      await db.labels.bulkPut(labels);
    });
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
