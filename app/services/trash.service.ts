import { db } from "~/repositories/db";
import { taskRepository } from "~/repositories/task.repository";
import { assertProjectPermission } from "~/auth/assert";

/**
 * 软删除机制（回收站页面已移除）：
 * 删除 = 打 deletedAt 标记 + toast 撤销；30 天后由 purgeExpired 自动彻底清理。
 * 权限在服务内解析：任务删除 task:delete，项目删除/恢复 project:delete（仅所有者）。
 */
export const trashService = {
  async deleteTask(actorId: string, taskId: string): Promise<void> {
    const task = await db.tasks.get(taskId);
    if (!task || task.deletedAt) return;
    await assertProjectPermission(task.projectId, actorId, "task:delete");
    const now = new Date().toISOString();
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.update(taskId, { deletedAt: now, deletedByProjectId: null });
      await db.comments.where("taskId").equals(taskId).modify({ deletedAt: now });
    });
  },

  async restoreTask(actorId: string, taskId: string): Promise<void> {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    await assertProjectPermission(task.projectId, actorId, "task:delete");
    if (task.deletedByProjectId) {
      throw new Error("该任务随所属项目删除，无法单独恢复");
    }
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.update(taskId, { deletedAt: null });
      await db.comments.where("taskId").equals(taskId).modify({ deletedAt: null });
    });
  },

  async purgeTask(taskId: string): Promise<void> {
    await taskRepository.purge(taskId);
  },

  async deleteProject(actorId: string, projectId: string): Promise<void> {
    const project = await db.projects.get(projectId);
    if (!project || project.deletedAt) return;
    await assertProjectPermission(projectId, actorId, "project:delete");
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
  },

  async restoreProject(actorId: string, projectId: string): Promise<void> {
    const project = await db.projects.get(projectId);
    if (!project?.deletedAt) return;
    await assertProjectPermission(projectId, actorId, "project:delete");
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      await db.projects.update(projectId, { deletedAt: null });
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        if (t.deletedByProjectId !== projectId) continue;
        await db.tasks.update(t.id, { deletedAt: null, deletedByProjectId: null });
        await db.comments.where("taskId").equals(t.id).modify({ deletedAt: null });
      }
    });
  },

  async purgeProject(projectId: string): Promise<void> {
    await db.transaction("rw", [db.projects, db.tasks, db.comments, db.taskLinks, db.milestones, db.automations], async () => {
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        await db.comments.where("taskId").equals(t.id).delete();
        await db.taskLinks.where("fromTaskId").equals(t.id).delete();
        await db.taskLinks.where("toTaskId").equals(t.id).delete();
        await db.tasks.delete(t.id);
      }
      await db.taskLinks.where("projectId").equals(projectId).delete();
      await db.milestones.where("projectId").equals(projectId).delete();
      await db.automations.where("projectId").equals(projectId).delete();
      await db.projects.delete(projectId);
    });
  },

  async purgeExpired(): Promise<number> {
    const cutoff = Date.now() - 30 * 86400000;
    let count = 0;
    const projects = (await db.projects.toArray()).filter(
      (p) => p.deletedAt && new Date(p.deletedAt).getTime() < cutoff,
    );
    for (const p of projects) {
      await this.purgeProject(p.id);
      count++;
    }
    const tasks = (await db.tasks.toArray()).filter(
      (t) => t.deletedAt && t.deletedByProjectId === null && new Date(t.deletedAt).getTime() < cutoff,
    );
    for (const t of tasks) {
      await this.purgeTask(t.id);
      count++;
    }
    return count;
  },
};
