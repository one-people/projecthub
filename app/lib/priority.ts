import type { Priority } from "~/models/task";
import type { Dict } from "~/locales/zh-CN";

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "紧急", color: "#DC2626" },
  high: { label: "高", color: "#D97706" },
  medium: { label: "中", color: "#2563EB" },
  low: { label: "低", color: "#059669" },
  none: { label: "无", color: "#94A3B8" },
};

/** 优先级 → i18n key（展示层翻译，替代硬编码中文 label） */
export const PRIORITY_LABEL_KEY: Record<Priority, keyof Dict> = {
  urgent: "prioUrgent",
  high: "prioHigh",
  medium: "prioMedium",
  low: "prioLow",
  none: "prioNone",
};

export const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const priorityRank = (p: string) => PRIORITY_ORDER[p] ?? 9;
