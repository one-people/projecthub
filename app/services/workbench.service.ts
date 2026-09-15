import { db } from "~/repositories/db";
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
  projects: WorkbenchProjectCard[];
}

export const workbenchService = {
  async load(userId: string): Promise<WorkbenchData> {
    const [allTasks, projects] = await Promise.all([
      db.tasks.toArray(),
      db.projects.toArray(),
    ]);
    const mine = allTasks.filter(
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
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        openTaskCount: allTasks.filter(
          (t) => t.projectId === p.id && t.completedAt === null,
        ).length,
      })),
    };
  },
};
