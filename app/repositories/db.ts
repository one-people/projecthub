import Dexie, { type EntityTable } from "dexie";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import type { Notification } from "~/models/notification";
import type { AuditLog } from "~/models/auditLog";

export interface Preference {
  key: string;
  value: unknown;
}

class ProjectHubDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  tasks!: EntityTable<Task, "id">;
  comments!: EntityTable<Comment, "id">;
  notifications!: EntityTable<Notification, "id">;
  users!: EntityTable<User, "id">;
  preferences!: EntityTable<Preference, "key">;
  auditLogs!: EntityTable<AuditLog, "id">;

  constructor() {
    super("projecthub");
    this.version(1).stores({
      projects: "id, updatedAt",
      tasks: "id, projectId, status, [projectId+status+order], assigneeId, dueDate, priority, archived",
      comments: "id, taskId, createdAt",
      notifications: "id, userId, createdAt",
      users: "id, name",
      preferences: "key",
    });
    this.version(2)
      .stores({
        tasks: "id, projectId, status, [projectId+status+order], assigneeId, dueDate, priority, archived, deletedAt",
        comments: "id, taskId, createdAt, deletedAt",
        projects: "id, updatedAt, deletedAt",
        auditLogs: "id, createdAt, actorId, entityType",
      })
      .upgrade(async (tx) => {
        for (const table of [tx.table("tasks"), tx.table("projects"), tx.table("comments")]) {
          await table.toCollection().modify((row: Record<string, unknown>) => {
            if (row.deletedAt === undefined) row.deletedAt = null;
            if (table.name === "tasks" && row.deletedByProjectId === undefined) {
              row.deletedByProjectId = null;
            }
          });
        }
      });
  }
}

export const db = new ProjectHubDB();
