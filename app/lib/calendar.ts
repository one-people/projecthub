// 日历视图的月份网格与日期工具：全部基于本地时区的“日”粒度
export interface CalendarDay {
  key: string; // yyyy-mm-dd（本地）
  date: Date;
  inMonth: boolean;
  isToday: boolean;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 时间 → 本地日期 key（任务 dueDate 排布用） */
export function isoToDateKey(iso: string): string {
  return dateKey(new Date(iso));
}

/** 本地日期 key → 当地零点的 ISO 时间（写回任务 dueDate 用） */
export function localMidnightIso(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d).toISOString();
}

/** 以周一为一周起点，返回覆盖指定月份的 6×7 网格 */
export function buildMonthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const today = dateKey(new Date());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dateKey(d), date: d, inMonth: d.getMonth() === month, isToday: dateKey(d) === today };
  });
}

/** 逾期判定：有截止日期、未完成、且截止日早于今天 */
export function isOverdue(
  task: { dueDate: string | null; completedAt: string | null },
  todayKey: string,
): boolean {
  if (!task.dueDate || task.completedAt) return false;
  return isoToDateKey(task.dueDate) < todayKey;
}
