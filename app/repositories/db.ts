import Dexie, { type EntityTable } from "dexie";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import type { Notification } from "~/models/notification";

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
  }
}

export const db = new ProjectHubDB();
