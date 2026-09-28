import { z } from "zod";

export const statusColumnSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  isDone: z.boolean().default(false), // 落入该列视为已完成
  order: z.number().int(),
});
export type StatusColumn = z.infer<typeof statusColumnSchema>;

/** 表格视图自定义字段：文本/数字/日期/单选 */
export const customFieldSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  type: z.enum(["text", "number", "date", "select"]),
  options: z.array(z.string()).default([]), // select 选项
});
export type CustomField = z.infer<typeof customFieldSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().default(""),
  statusColumns: z.array(statusColumnSchema),
  customFields: z.array(customFieldSchema).default([]),
  /** 项目所有者（Worktile 式唯一所有者，可移交）；所有者同时保留 admin 成员项便于展示 */
  ownerId: z.string(),
  memberRoles: z.record(z.enum(["admin", "member", "guest"])), // userId -> roleId
  deletedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(0),
});
export type Project = z.infer<typeof projectSchema>;

export type ProjectInput = z.input<typeof projectSchema>;
