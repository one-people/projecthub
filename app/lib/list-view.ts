import type { Priority } from "~/models/task";
import type { Dict } from "~/locales/zh-CN";

export type DueFilter = "all" | "today" | "week" | "overdue" | "none";
export type StatusFilter = "all" | "open" | "done";

export interface Filters {
  assigneeId: string; // "all" = 全部（兼容历史数据中的 ""）
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
  "#3F3F46", "#0F766E", "#B45309", "#7C3AED",
  "#BE185D", "#4F46E5", "#4D7C0F", "#9A3412",
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

// 纯数据层：chip 只携带 i18n key，展示文案由组件层调用 t() 翻译
const DUE_LABEL: Record<string, keyof Dict> = {
  today: "dueToday", week: "dueWeek", overdue: "dueOverdue", none: "dueNone",
};
const PRIORITY_LABEL: Record<string, keyof Dict> = {
  urgent: "prioUrgent", high: "prioHigh", medium: "prioMedium", low: "prioLow", none: "prioNone",
};
const STATUS_LABEL: Record<string, keyof Dict> = { open: "statusOpen", done: "statusDone" };

export interface FilterChip {
  key: "assigneeId" | "due" | "priority" | "status";
  labelKey: keyof Dict;
  /** 直接展示的原始值（负责人姓名，或未知枚举的原始字符串） */
  value: string;
  /** 存在时表示 value 是 i18n key，由组件翻译展示 */
  valueKey?: keyof Dict;
}

export function activeFilterChips(
  filters: Filters,
  assigneeOptions: { id: string; name: string }[],
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.assigneeId !== "all" && filters.assigneeId !== "") {
    const name = assigneeOptions.find((a) => a.id === filters.assigneeId)?.name;
    chips.push({
      key: "assigneeId",
      labelKey: "colAssignee",
      value: name ?? "unknownUser",
      valueKey: name ? undefined : "unknownUser",
    });
  }
  if (filters.due !== "all") {
    chips.push({
      key: "due",
      labelKey: "colDueDate",
      value: filters.due,
      valueKey: DUE_LABEL[filters.due],
    });
  }
  if (filters.priority !== "all") {
    chips.push({
      key: "priority",
      labelKey: "colPriority",
      value: filters.priority,
      valueKey: PRIORITY_LABEL[filters.priority],
    });
  }
  if (filters.status !== "all") {
    chips.push({
      key: "status",
      labelKey: "colStatus",
      value: filters.status,
      valueKey: STATUS_LABEL[filters.status],
    });
  }
  return chips;
}
