import { z } from "zod";

export const commentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  authorId: z.string(),
  contentRich: z.unknown().nullable().default(null), // TipTap JSON
  mentions: z.array(z.string()).default([]), // 被 @ 的 userId
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(0),
});
export type Comment = z.infer<typeof commentSchema>;

export type CommentInput = z.input<typeof commentSchema>;
