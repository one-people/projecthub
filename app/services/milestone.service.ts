import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { assertProjectPermission } from "~/auth/assert";
import type { Milestone } from "~/models/milestone";

export const milestoneService = {
  /** 按日期升序返回项目里程碑 */
  async list(projectId: string): Promise<Milestone[]> {
    const rows = await db.milestones.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date < b.date ? -1 : 1));
  },

  async create(actorId: string, projectId: string, title: string, date: string): Promise<Milestone> {
    await assertProjectPermission(projectId, actorId, "milestone:manage");
    const trimmed = title.trim();
    if (!trimmed) throw new Error("里程碑标题不能为空");
    if (!date) throw new Error("里程碑日期不能为空");
    const now = new Date().toISOString();
    const milestone: Milestone = {
      id: uuid(),
      projectId,
      title: trimmed,
      date,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.milestones.add(milestone);
    return milestone;
  },

  async update(actorId: string, id: string, patch: Partial<Pick<Milestone, "title" | "date" | "doneAt">>): Promise<void> {
    const milestone = await db.milestones.get(id);
    if (!milestone) return;
    await assertProjectPermission(milestone.projectId, actorId, "milestone:manage");
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("里程碑标题不能为空");
    }
    await db.milestones.update(id, {
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      updatedAt: new Date().toISOString(),
    });
  },

  async remove(actorId: string, id: string): Promise<void> {
    const milestone = await db.milestones.get(id);
    if (!milestone) return;
    await assertProjectPermission(milestone.projectId, actorId, "milestone:manage");
    await db.milestones.delete(id);
  },

  /** 项目被彻底删除时清理其里程碑 */
  async stripProject(projectId: string): Promise<void> {
    await db.milestones.where("projectId").equals(projectId).delete();
  },
};
