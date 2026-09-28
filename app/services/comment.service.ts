import { commentRepository } from "~/repositories/comment.repository";
import { broadcastChange } from "~/repositories/broadcast";
import { can, type RoleId } from "~/auth/rbac";
import type { Comment, CommentInput } from "~/models/comment";

export class PermissionError extends Error {}

export const commentService = {
  async list(taskId: string): Promise<Comment[]> {
    return commentRepository.listByTask(taskId);
  },

  async create(
    _actorId: string,
    actorRole: RoleId,
    input: Omit<CommentInput, "createdAt" | "updatedAt" | "version" | "mentions">,
  ): Promise<Comment> {
    if (!can(actorRole, "comment:create")) {
      throw new PermissionError(`角色 ${actorRole} 无评论权限`);
    }
    const comment = await commentRepository.create({ ...input, mentions: [] });
    broadcastChange({ table: "comments", ids: [comment.id] });
    return comment;
  },
};
