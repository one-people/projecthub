import { commentRepository } from "~/repositories/comment.repository";
import { db } from "~/repositories/db";
import { broadcastChange } from "~/repositories/broadcast";
import { can, type RoleId } from "~/auth/rbac";
import { extractMentionIds } from "./mention.service";
import { notificationService } from "./notification.service";
import type { Comment, CommentInput } from "~/models/comment";

export class PermissionError extends Error {}

export const commentService = {
  async list(taskId: string): Promise<Comment[]> {
    return commentRepository.listByTask(taskId);
  },

  async create(
    actorId: string,
    actorRole: RoleId,
    input: Omit<CommentInput, "createdAt" | "updatedAt" | "version" | "mentions">,
  ): Promise<Comment> {
    if (!can(actorRole, "comment:create")) {
      throw new PermissionError(`角色 ${actorRole} 无评论权限`);
    }
    const mentions = extractMentionIds(input.contentRich);
    const comment = await commentRepository.create({ ...input, mentions });

    const task = await db.tasks.get(comment.taskId);
    const taskTitle = task?.title ?? "";

    // @提及通知
    for (const userId of mentions) {
      await notificationService.notify({
        userId,
        actorId,
        type: "mention",
        taskId: comment.taskId,
        taskTitle,
      });
    }
    // 评论通知：负责人 + 之前的评论者，排除本人与已提及用户
    if (task?.assigneeId) {
      await notificationService.notify({
        userId: task.assigneeId,
        actorId,
        type: "comment",
        taskId: comment.taskId,
        taskTitle,
      });
    }
    const previous = await commentRepository.listByTask(comment.taskId);
    for (const c of previous) {
      if (c.authorId === actorId || mentions.includes(c.authorId)) continue;
      if (c.authorId === task?.assigneeId) continue;
      await notificationService.notify({
        userId: c.authorId,
        actorId,
        type: "comment",
        taskId: comment.taskId,
        taskTitle,
      });
    }

    broadcastChange({ table: "comments", ids: [comment.id] });
    return comment;
  },
};
