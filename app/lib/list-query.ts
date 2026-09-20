import type { Task } from "~/models/task";
import type { Filters } from "~/lib/list-view";
import type { SortRule } from "~/components/list/SortMenu";
import { priorityRank } from "~/lib/priority";

const DAY = 24 * 3600 * 1000;

export function applyFilters(tasks: Task[], filters: Filters): Task[] {
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const weekEnd = endOfToday.getTime() + 6 * DAY;

  return tasks.filter((t) => {
    if (t.archived) return false;
    if (filters.assigneeId !== "all" && t.assigneeId !== filters.assigneeId) return false;
    if (filters.priority !== "all" && t.priority !== filters.priority) return false;
    if (filters.status === "done" && !t.completedAt) return false;
    if (filters.status === "open" && t.completedAt) return false;

    const due = t.dueDate ? new Date(t.dueDate).getTime() : null;
    switch (filters.due) {
      case "today":
        if (due === null || due > endOfToday.getTime()) return false;
        break;
      case "week":
        if (due === null || due > weekEnd || due < now - 30 * DAY) return false;
        break;
      case "overdue":
        if (due === null || due >= now || t.completedAt) return false;
        break;
      case "none":
        if (due !== null) return false;
        break;
    }
    return true;
  });
}

export function applySort(tasks: Task[], rule: SortRule): Task[] {
  const dir = rule.direction === "asc" ? 1 : -1;
  return tasks.slice().sort((a, b) => {
    let cmp = 0;
    switch (rule.field) {
      case "title":
        cmp = a.title.localeCompare(b.title, "zh-CN");
        break;
      case "assignee":
        cmp = (a.assigneeId ?? "").localeCompare(b.assigneeId ?? "");
        break;
      case "dueDate":
        cmp =
          (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
          (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
        break;
      case "priority":
        cmp = priorityRank(a.priority) - priorityRank(b.priority);
        break;
      case "updatedAt":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }
    return cmp * dir || (a.order < b.order ? -1 : 1);
  });
}
