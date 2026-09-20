import type { Priority } from "~/models/task";

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "紧急", color: "#DC2626" },
  high: { label: "高", color: "#D97706" },
  medium: { label: "中", color: "#2563EB" },
  low: { label: "低", color: "#059669" },
  none: { label: "无", color: "#94A3B8" },
};

export const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const priorityRank = (p: string) => PRIORITY_ORDER[p] ?? 9;
