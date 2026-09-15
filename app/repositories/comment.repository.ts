import { db } from "./db";
import { commentSchema, type Comment, type CommentInput } from "~/models/comment";
import { uuid } from "~/lib/id";

function validate(row: unknown): Comment {
  return commentSchema.parse(row);
}

export const commentRepository = {
  async listByTask(taskId: string): Promise<Comment[]> {
    const rows = await db.comments.where("taskId").equals(taskId).toArray();
    return rows
      .filter((r) => r.deletedAt === null)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(validate);
  },

  async listDeleted(): Promise<Comment[]> {
    const rows = await db.comments.toArray();
    return rows.filter((r) => r.deletedAt !== null).map(validate);
  },

  async create(
    input: Omit<CommentInput, "createdAt" | "updatedAt" | "version">,
  ): Promise<Comment> {
    const now = new Date().toISOString();
    const comment = validate({
      ...input,
      id: input.id ?? uuid(),
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    await db.comments.add(comment);
    return comment;
  },

  async remove(id: string): Promise<void> {
    await db.comments.delete(id);
  },
};
