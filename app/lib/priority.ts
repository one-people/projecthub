import type { Priority } from "~/models/task";

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "紧急", color: "#DC2626" },
  high: { label: "高", color: "#D97706" },
  medium: { label: "中", color: "#2563EB" },
  low: { label: "低", color: "#059669" },
  none: { label: "无", color: "#94A3B8" },
};
