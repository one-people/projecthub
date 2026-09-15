import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "mention",
  "assign",
  "comment",
  "status_change",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(), // 接收者
  type: notificationTypeSchema,
  payload: z.object({
    taskId: z.string().nullable().default(null),
    taskTitle: z.string().default(""),
    actorId: z.string(), // 触发者
    count: z.number().int().default(1), // 去重合并后的累计次数
  }),
  read: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export type NotificationInput = z.input<typeof notificationSchema>;
