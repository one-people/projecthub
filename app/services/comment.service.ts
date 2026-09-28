import { commentRepository } from "~/repositories/comment.repository";
import { broadcastChange } from "~/repositories/broadcast";
import { db } from "~/repositories/db";
import { assertProjectPermission } from "~/auth/assert";
import type { Comment, CommentInput } from "~/models/comment";

export const commentService = {
  async list(taskId: string): Promise<Comment[]> {
    return commentRepository.listByTask(taskId);
  },

  async create(
    actorId: string,
    input: Omit<CommentInput, "createdAt" | "updatedAt" | "version" | "mentions">,
  ): Promise<Comment> {
    const task = await db.tasks.get(input.taskId);
    if (!task) throw new Error(`Task ${input.taskId} not found`);
    await assertProjectPermission(task.projectId, actorId, "comment:create");
    const comment = await commentRepository.create({ ...input, mentions: [] });
    broadcastChange({ table: "comments", ids: [comment.id] });
    return comment;
  },
};
