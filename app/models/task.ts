import { z } from "zod";

export const prioritySchema = z.enum([
  "urgent",
  "high",
  "medium",
  "low",
  "none",
]);
export type Priority = z.infer<typeof prioritySchema>;

export const subtaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  done: z.boolean().default(false),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const recurrenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** 父任务 id：非空即为子任务（仅允许一层，服务层校验）；与内嵌 subtasks 清单是两套概念 */
  parentId: z.string().nullable().default(null),
  title: z.string().min(1).max(200),
  descriptionRich: z.unknown().nullable().default(null), // TipTap JSON
  status: z.string(), // StatusColumn.id
  assigneeId: z.string().nullable().default(null),
  startDate: z.string().nullable().default(null), // ISO 8601（甘特跨度起点）
  dueDate: z.string().nullable().default(null), // ISO 8601
  customValues: z.record(z.unknown()).default({}), // 自定义字段值 fieldId -> 值
  priority: prioritySchema.default("none"),
  labels: z.array(z.string()).default([]),
  subtasks: z.array(subtaskSchema).default([]),
  recurrence: recurrenceSchema.default("none"), // 重复规则：完成时自动生成下一期
  order: z.string().default("a0"), // fractional indexing
  archived: z.boolean().default(false),
  deletedAt: z.string().nullable().default(null),
  deletedByProjectId: z.string().nullable().default(null),
  /** 随父任务级联软删的标记（= 父任务 id）：恢复父任务时按此识别同批子任务；
   * 用显式标记而非 deletedAt 时间戳相等判断，避免两次删除落在同一毫秒的误恢复 */
  deletedByParentTaskId: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(0),
});
export type Task = z.infer<typeof taskSchema>;

export type TaskInput = z.input<typeof taskSchema>;
