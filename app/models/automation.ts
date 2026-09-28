import { z } from "zod";

/** 自动化规则：when（触发器）→ then（动作） */
export const automationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  trigger: z.object({
    type: z.enum(["task_created", "status_entered", "task_completed"]),
    columnId: z.string().nullable().default(null),
  }),
  action: z.object({
    type: z.enum(["assign", "set_priority", "move_to", "add_label"]),
    value: z.string().nullable().default(null),
  }),
  createdAt: z.string(),
});
export type Automation = z.infer<typeof automationSchema>;
