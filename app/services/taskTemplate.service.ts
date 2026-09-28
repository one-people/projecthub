import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { Task, TaskInput } from "~/models/task";
import type { TaskTemplate } from "~/models/taskTemplate";

/** 任务模板库：从任务保存模板 / 从模板一键建任务 */
export const taskTemplateService = {
  /** 项目可用模板 = 全局 + 本项目 */
  async listForProject(projectId: string): Promise<TaskTemplate[]> {
    const rows = await db.taskTemplates.toArray();
    return rows
      .filter((tpl) => tpl.projectId === null || tpl.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async listAll(): Promise<TaskTemplate[]> {
    const rows = await db.taskTemplates.toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },

  /** 把任务保存为模板（标题/描述/优先级/标签/子任务/重复规则） */
  async createFromTask(task: Task, name?: string): Promise<TaskTemplate> {
    const tpl: TaskTemplate = {
      id: uuid(),
      projectId: task.projectId,
      name: (name ?? task.title).trim().slice(0, 100) || task.title,
      title: task.title,
      descriptionRich: task.descriptionRich ?? null,
      priority: task.priority,
      subtasks: task.subtasks.map((s) => ({ title: s.title })),
      labels: task.labels,
      recurrence: task.recurrence ?? "none",
      createdAt: new Date().toISOString(),
    };
    await db.taskTemplates.add(tpl);
    return tpl;
  },

  async remove(id: string): Promise<void> {
    await db.taskTemplates.delete(id);
  },

  /** 由模板构造新任务输入（不携带日期/负责人，子任务全部未完成） */
  buildTaskInput(tpl: TaskTemplate, projectId: string, status: string): Omit<TaskInput, "createdAt" | "updatedAt" | "version"> {
    return {
      id: uuid(),
      projectId,
      title: tpl.title,
      descriptionRich: tpl.descriptionRich ?? null,
      status,
      assigneeId: null,
      startDate: null,
      dueDate: null,
      customValues: {},
      priority: tpl.priority,
      labels: tpl.labels,
      subtasks: tpl.subtasks.map((s) => ({ id: uuid(), title: s.title, done: false })),
      recurrence: tpl.recurrence ?? "none",
    };
  },
};
