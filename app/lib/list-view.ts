import type { Priority } from "~/models/task";

export type DueFilter = "all" | "today" | "week" | "overdue" | "none";
export type StatusFilter = "all" | "open" | "done";

export interface Filters {
  assigneeId: string; // "" = 全部
  due: DueFilter;
  priority: Priority | "all";
  status: StatusFilter;
}

export const EMPTY_FILTERS: Filters = {
  assigneeId: "all",
  due: "all",
  priority: "all",
  status: "all",
};

export const PALETTE = [
  "#1E293B", "#0F766E", "#B45309", "#7C3AED",
  "#BE185D", "#1D4ED8", "#4D7C0F", "#9A3412",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function statusColor(columnId: string): string {
  return PALETTE[hash(columnId) % PALETTE.length]!;
}

export function avatarColor(name: string): string {
  return PALETTE[hash(name) % PALETTE.length]!;
}

const DUE_LABEL: Record<string, string> = {
  today: "今天", week: "本周", overdue: "已逾期", none: "无日期",
};
const PRIORITY_LABEL: Record<string, string> = {
  urgent: "紧急", high: "高", medium: "中", low: "低", none: "无",
};
const STATUS_LABEL: Record<string, string> = { open: "未完成", done: "已完成" };

export interface FilterChip {
  key: "assigneeId" | "due" | "priority" | "status";
  label: string;
  value: string;
}

export function activeFilterChips(
  filters: Filters,
  assigneeOptions: { id: string; name: string }[],
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.assigneeId !== "all" && filters.assigneeId !== "") {
    chips.push({
      key: "assigneeId",
      label: "负责人",
      value: assigneeOptions.find((a) => a.id === filters.assigneeId)?.name ?? "未知",
    });
  }
  if (filters.due !== "all") {
    chips.push({ key: "due", label: "截止日期", value: DUE_LABEL[filters.due] ?? filters.due });
  }
  if (filters.priority !== "all") {
    chips.push({
      key: "priority",
      label: "优先级",
      value: PRIORITY_LABEL[filters.priority] ?? filters.priority,
    });
  }
  if (filters.status !== "all") {
    chips.push({ key: "status", label: "状态", value: STATUS_LABEL[filters.status] ?? filters.status });
  }
  return chips;
}
