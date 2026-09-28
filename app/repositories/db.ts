import Dexie, { type EntityTable } from "dexie";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import type { Label } from "~/models/label";
import type { TaskLink } from "~/models/taskLink";
import type { Milestone } from "~/models/milestone";
import type { Automation } from "~/models/automation";
import type { ProjectTemplate } from "~/models/projectTemplate";
import type { TaskTemplate } from "~/models/taskTemplate";

export interface Preference {
  key: string;
  value: unknown;
}

class ProjectHubDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  tasks!: EntityTable<Task, "id">;
  comments!: EntityTable<Comment, "id">;
  users!: EntityTable<User, "id">;
  preferences!: EntityTable<Preference, "key">;
  labels!: EntityTable<Label, "id">;
  taskLinks!: EntityTable<TaskLink, "id">;
  milestones!: EntityTable<Milestone, "id">;
  automations!: EntityTable<Automation, "id">;
  projectTemplates!: EntityTable<ProjectTemplate, "id">;
  taskTemplates!: EntityTable<TaskTemplate, "id">;

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
    // v3：移除通知/审计功能（回收站页、通知页、用户管理与审计已删）
    this.version(3).stores({
      notifications: null,
      auditLogs: null,
    });
    // v4：标签 / 任务关联 / 里程碑 / 自动化 / 模板
    this.version(4).stores({
      labels: "id, projectId",
      taskLinks: "id, fromTaskId, toTaskId",
      milestones: "id, projectId",
      automations: "id, projectId",
      projectTemplates: "id",
      taskTemplates: "id, projectId",
    });
    // v5：任务关联表增加 projectId 索引（按项目列出关联）
    this.version(5).stores({
      taskLinks: "id, projectId, fromTaskId, toTaskId",
    });
    // v6：回填后续版本新增的任务字段（旧数据行缺省，liveQuery 原始读取不经 Zod 默认值）
    this.version(6).upgrade(async (tx) => {
      await tx.table("tasks").toCollection().modify((row: Record<string, unknown>) => {
        if (row.recurrence === undefined) row.recurrence = "none";
        if (row.labels === undefined) row.labels = [];
        if (row.customValues === undefined) row.customValues = {};
      });
    });
  }
}

export const db = new ProjectHubDB();
