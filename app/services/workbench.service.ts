import { db } from "~/repositories/db";
import { isProjectVisible } from "~/auth/rbac";
import type { Task } from "~/models/task";

export interface WorkbenchProjectCard {
  id: string;
  name: string;
  openTaskCount: number;
}

export interface WorkbenchData {
  pending: Task[]; // assignee 是我、未完成
  today: Task[]; // 今日到期、未完成
  overdue: Task[]; // 已逾期、未完成
  recent: Task[]; // 最近更新（最多 20 条）
  weekDone: number; // 最近 7 天我完成的任务数
  projects: WorkbenchProjectCard[];
}

export const workbenchService = {
  async load(userId: string): Promise<WorkbenchData> {
    const [allTasks, projects] = await Promise.all([
      db.tasks.toArray(),
      db.projects.toArray(),
    ]);
    // 私有制：非成员项目不可见，其任务也不进入我的任务/统计
    const visibleIds = new Set(
      projects.filter((p) => isProjectVisible(p, userId)).map((p) => p.id),
    );
    const visibleProjects = projects.filter((p) => p.deletedAt === null && visibleIds.has(p.id));
    const live = allTasks.filter((t) => t.deletedAt === null && visibleIds.has(t.projectId));
    const mine = live.filter(
      (t) => t.assigneeId === userId && t.completedAt === null,
    );
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 86400000;
    const isToday = (t: Task) =>
      t.dueDate !== null &&
      new Date(t.dueDate).getTime() >= dayStart.getTime() &&
      new Date(t.dueDate).getTime() < dayEnd;
    const isOverdue = (t: Task) =>
      t.dueDate !== null && new Date(t.dueDate).getTime() < dayStart.getTime();

    return {
      pending: mine,
      today: mine.filter(isToday),
      overdue: mine.filter(isOverdue),
      recent: mine
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
      weekDone: live.filter(
        (t) =>
          t.assigneeId === userId &&
          t.completedAt !== null &&
          new Date(t.completedAt).getTime() > Date.now() - 7 * 86400000,
      ).length,
      projects: visibleProjects
        .map((p) => ({
          id: p.id,
          name: p.name,
          openTaskCount: live.filter(
            (t) => t.projectId === p.id && t.completedAt === null,
          ).length,
        })),
    };
  },
};
