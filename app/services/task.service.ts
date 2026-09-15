import { taskRepository } from "~/repositories/task.repository";
import { db } from "~/repositories/db";
import { can, type RoleId } from "~/auth/rbac";
import { notificationService } from "./notification.service";
import { auditService } from "./audit.service";
import type { Task, TaskInput } from "~/models/task";

export class PermissionError extends Error {}

function assertPermission(roleId: RoleId, permission: Parameters<typeof can>[1]) {
  if (!can(roleId, permission)) {
    throw new PermissionError(`角色 ${roleId} 无 ${permission} 权限`);
  }
}

export const taskService = {
  async list(projectId: string): Promise<Task[]> {
    return taskRepository.listByProject(projectId);
  },

  async create(
    actorId: string,
    actorRole: RoleId,
    input: Omit<TaskInput, "createdAt" | "updatedAt" | "version">,
  ): Promise<Task> {
    assertPermission(actorRole, "task:create");
    const task = await taskRepository.create(input);
    await auditService.log(actorId, "create", "task", task.id, `创建了任务「${task.title}」`);
    return task;
  },

  async moveTask(
    actorId: string,
    actorRole: RoleId,
    taskId: string,
    targetStatus: string,
    prevOrder: string | null,
    nextOrder: string | null,
  ): Promise<Task> {
    assertPermission(actorRole, "task:update");
    const original = await taskRepository.get(taskId);
    if (!original) throw new Error(`Task ${taskId} not found`);
    const project = await db.projects.get(original.projectId);
    const targetColumn = project?.statusColumns.find((c) => c.id === targetStatus);
    const task = await taskRepository.move(taskId, targetStatus, prevOrder, nextOrder);
    if (task.assigneeId && original.status !== targetStatus) {
      await notificationService.notify({
        userId: task.assigneeId,
        actorId,
        type: "status_change",
        taskId: task.id,
        taskTitle: task.title,
      });
    }
    // 状态自动流转：落入「完成列」记录 completedAt，离开则清除
    let result = task;
    if (targetColumn?.isDone && !task.completedAt) {
      result = await taskRepository.update(taskId, {
        completedAt: new Date().toISOString(),
      }, task.version);
    } else if (!targetColumn?.isDone && task.completedAt) {
      result = await taskRepository.update(taskId, { completedAt: null }, task.version);
    }
    await auditService.log(actorId, "update", "task", taskId, `移动了任务「${task.title}」`);
    return result;
  },
};
