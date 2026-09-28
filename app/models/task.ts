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
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(0),
});
export type Task = z.infer<typeof taskSchema>;

export type TaskInput = z.input<typeof taskSchema>;
