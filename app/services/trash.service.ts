import { db } from "~/repositories/db";
import { taskRepository } from "~/repositories/task.repository";
import { can, type RoleId } from "~/auth/rbac";
import { auditService } from "./audit.service";

class PermissionError extends Error {}

function assert(role: RoleId, permission: Parameters<typeof can>[1]) {
  if (!can(role, permission)) throw new PermissionError(`角色 ${role} 无 ${permission} 权限`);
}

export const trashService = {
  async deleteTask(actorId: string, actorRole: RoleId, taskId: string): Promise<void> {
    assert(actorRole, "task:delete");
    const task = await db.tasks.get(taskId);
    if (!task || task.deletedAt) return;
    const now = new Date().toISOString();
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.update(taskId, { deletedAt: now, deletedByProjectId: null });
      await db.comments.where("taskId").equals(taskId).modify({ deletedAt: now });
    });
    await auditService.log(actorId, "delete", "task", taskId, `删除了任务「${task.title}」`);
  },

  async restoreTask(actorId: string, actorRole: RoleId, taskId: string): Promise<void> {
    assert(actorRole, "task:delete");
    const task = await db.tasks.get(taskId);
    if (!task) return;
    if (task.deletedByProjectId) {
      throw new Error("该任务随项目删除，请在回收站恢复所属项目");
    }
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.update(taskId, { deletedAt: null });
      await db.comments.where("taskId").equals(taskId).modify({ deletedAt: null });
    });
    await auditService.log(actorId, "restore", "task", taskId, `恢复了任务「${task.title}」`);
  },

  async purgeTask(actorId: string, taskId: string): Promise<void> {
    const task = await db.tasks.get(taskId);
    await taskRepository.purge(taskId);
    await auditService.log(actorId, "purge", "task", taskId, `彻底删除了任务「${task?.title ?? taskId}」`);
  },

  async deleteProject(actorId: string, actorRole: RoleId, projectId: string): Promise<void> {
    assert(actorRole, "project:delete");
    const project = await db.projects.get(projectId);
    if (!project || project.deletedAt) return;
    const now = new Date().toISOString();
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      await db.projects.update(projectId, { deletedAt: now });
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        if (t.deletedAt) continue;
        await db.tasks.update(t.id, { deletedAt: now, deletedByProjectId: projectId });
        await db.comments.where("taskId").equals(t.id).modify({ deletedAt: now });
      }
    });
    await auditService.log(actorId, "delete", "project", projectId, `删除了项目「${project.name}」`);
  },

  async restoreProject(actorId: string, actorRole: RoleId, projectId: string): Promise<void> {
    assert(actorRole, "project:delete");
    const project = await db.projects.get(projectId);
    if (!project?.deletedAt) return;
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      await db.projects.update(projectId, { deletedAt: null });
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        if (t.deletedByProjectId !== projectId) continue;
        await db.tasks.update(t.id, { deletedAt: null, deletedByProjectId: null });
        await db.comments.where("taskId").equals(t.id).modify({ deletedAt: null });
      }
    });
    await auditService.log(actorId, "restore", "project", projectId, `恢复了项目「${project.name}」`);
  },

  async purgeProject(actorId: string, projectId: string): Promise<void> {
    const project = await db.projects.get(projectId);
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        await db.comments.where("taskId").equals(t.id).delete();
        await db.tasks.delete(t.id);
      }
      await db.projects.delete(projectId);
    });
    await auditService.log(actorId, "purge", "project", projectId, `彻底删除了项目「${project?.name ?? projectId}」`);
  },

  async purgeExpired(): Promise<number> {
    const cutoff = Date.now() - 30 * 86400000;
    let count = 0;
    const projects = (await db.projects.toArray()).filter(
      (p) => p.deletedAt && new Date(p.deletedAt).getTime() < cutoff,
    );
    for (const p of projects) {
      await this.purgeProject("system", p.id);
      count++;
    }
    const tasks = (await db.tasks.toArray()).filter(
      (t) => t.deletedAt && t.deletedByProjectId === null && new Date(t.deletedAt).getTime() < cutoff,
    );
    for (const t of tasks) {
      await this.purgeTask("system", t.id);
      count++;
    }
    return count;
  },
};
