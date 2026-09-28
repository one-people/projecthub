import { taskRepository } from "~/repositories/task.repository";
import { db } from "~/repositories/db";
import { can, type RoleId } from "~/auth/rbac";
import type { Task, TaskInput } from "~/models/task";

export class PermissionError extends Error {}

/** 任务详情抽屉可编辑的字段（状态与完成态由服务端统一流转） */
export interface TaskUpdatePatch {
  title?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: Task["priority"];
  descriptionRich?: unknown;
  subtasks?: Task["subtasks"];
  status?: string;
  /** true=完成（若有完成列则同时流转状态）；false=取消完成 */
  completed?: boolean;
}

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
    // 状态自动流转：落入「完成列」记录 completedAt，离开则清除
    let result = task;
    if (targetColumn?.isDone && !task.completedAt) {
      result = await taskRepository.update(taskId, {
        completedAt: new Date().toISOString(),
      }, task.version);
    } else if (!targetColumn?.isDone && task.completedAt) {
      result = await taskRepository.update(taskId, { completedAt: null }, task.version);
    }
    return result;
  },

  async updateTask(
    actorId: string,
    actorRole: RoleId,
    taskId: string,
    patch: TaskUpdatePatch,
  ): Promise<Task> {
    assertPermission(actorRole, "task:update");
    const original = await taskRepository.get(taskId);
    if (!original) throw new Error(`Task ${taskId} not found`);
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("任务标题不能为空");
    }

    const project = await db.projects.get(original.projectId);
    const doneColumn = project?.statusColumns
      .filter((c) => c.isDone)
      .sort((a, b) => a.order - b.order)[0];
    const changed: string[] = [];
    let current = original;

    // 勾选完成：记录 completedAt，若有完成列则同时流转状态
    if (patch.completed === true && !current.completedAt) {
      const next: Partial<TaskInput> = { completedAt: new Date().toISOString() };
      if (doneColumn && current.status !== doneColumn.id) {
        next.status = doneColumn.id;
      }
      current = await taskRepository.update(taskId, next, current.version);
      changed.push("完成");
    }
    if (patch.completed === false && current.completedAt) {
      // 取消完成：若停留在完成列，则回到第一个未完成列
      const activeColumn = project?.statusColumns
        .filter((c) => !c.isDone)
        .sort((a, b) => a.order - b.order)[0];
      const next: Partial<TaskInput> = { completedAt: null };
      if (doneColumn && current.status === doneColumn.id && activeColumn) {
        next.status = activeColumn.id;
      }
      current = await taskRepository.update(taskId, next, current.version);
      changed.push("取消完成");
    }

    // 显式状态变更：与 moveTask 相同的完成列流转语义
    if (patch.status !== undefined && patch.status !== current.status) {
      const targetColumn = project?.statusColumns.find((c) => c.id === patch.status);
      current = await taskRepository.update(taskId, { status: patch.status }, current.version);
      if (targetColumn?.isDone && !current.completedAt) {
        current = await taskRepository.update(
          taskId,
          { completedAt: new Date().toISOString() },
          current.version,
        );
      } else if (!targetColumn?.isDone && current.completedAt) {
        current = await taskRepository.update(taskId, { completedAt: null }, current.version);
      }
      changed.push("状态");
    }

    // 其余字段只在真正变化时写库
    const rest: Partial<TaskInput> = {};
    if (patch.title !== undefined && patch.title !== current.title) {
      rest.title = patch.title;
      changed.push("标题");
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId) {
      rest.assigneeId = patch.assigneeId;
      changed.push("负责人");
    }
    if (patch.dueDate !== undefined && patch.dueDate !== current.dueDate) {
      rest.dueDate = patch.dueDate;
      changed.push("截止日期");
    }
    if (patch.priority !== undefined && patch.priority !== current.priority) {
      rest.priority = patch.priority;
      changed.push("优先级");
    }
    if (patch.descriptionRich !== undefined && patch.descriptionRich !== current.descriptionRich) {
      rest.descriptionRich = patch.descriptionRich;
      changed.push("描述");
    }
    if (patch.subtasks !== undefined && patch.subtasks !== current.subtasks) {
      rest.subtasks = patch.subtasks;
      changed.push("子任务");
    }
    if (Object.keys(rest).length > 0) {
      current = await taskRepository.update(taskId, rest, current.version);
    }
    return current;
  },
};
