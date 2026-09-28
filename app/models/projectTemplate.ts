import { z } from "zod";
import { customFieldSchema } from "./project";
import { prioritySchema, recurrenceSchema } from "./task";

/** 项目模板快照里的任务模板（labels 存标签名，实例化时映射为新项目标签 id） */
export const projectTemplateTaskSchema = z.object({
  name: z.string().default(""),
  title: z.string().min(1),
  descriptionRich: z.unknown().nullable().default(null),
  priority: prioritySchema.default("none"),
  subtasks: z.array(z.object({ title: z.string() })).default([]),
  labels: z.array(z.string()).default([]),
  recurrence: recurrenceSchema.default("none"),
});

/** 项目模板：内置或由现有项目另存（存列/标签/字段/任务模板结构） */
export const projectTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().default(""),
  builtin: z.boolean().default(false),
  columns: z.array(z.object({ name: z.string(), isDone: z.boolean().default(false) })),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
  customFields: z.array(customFieldSchema).default([]),
  taskTemplates: z.array(projectTemplateTaskSchema).default([]),
  createdAt: z.string(),
});
export type ProjectTemplate = z.infer<typeof projectTemplateSchema>;
export type ProjectTemplateTask = z.infer<typeof projectTemplateTaskSchema>;
