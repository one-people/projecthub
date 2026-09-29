import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { Task } from "~/models/task";
import type { TaskLink } from "~/models/taskLink";
import type { Milestone } from "~/models/milestone";
import { dateKey, isoToDateKey } from "~/lib/calendar";
import { countHolidays } from "~/lib/holidays";
import { statusColor } from "~/lib/list-view";
import { useI18n } from "~/lib/i18n";

export type TimelineZoom = "day" | "week" | "month";

export interface TimelineViewProps {
  tasks: Task[];
  links: TaskLink[];
  milestones: Milestone[];
  zoom: TimelineZoom;
  users: { id: string; name: string }[];
  canManageMilestones?: boolean;
  onOpenTask: (task: Task) => void;
  onToggleMilestone?: (ms: Milestone) => void;
}

const NAME_W = 232;
const ROW_H = 36;
const BAR_H = 18;
const BAR_SUB_H = 12;
const HEADER_H = 56;
const MS_H = 30;
const PX_PER_DAY: Record<TimelineZoom, number> = { day: 30, week: 120 / 7, month: 160 / 30.44 };

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function startOfWeekMonday(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

interface Span {
  key: string;
  label: string;
  days: number;
  /** 周末底纹（仅日缩放） */
  weekend?: boolean;
}

/** 甘特/时间线：startDate→dueDate 条带 + 依赖箭头 + 里程碑菱形（纯 CSS/SVG，零依赖） */
export function TimelineView({
  tasks, links, milestones, zoom, users, canManageMilestones, onOpenTask, onToggleMilestone,
}: TimelineViewProps) {
  const { t, locale } = useI18n();
  const todayKeyStr = dateKey(new Date());

  const assigneeNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) map[u.id] = u.name;
    return map;
  }, [users]);

  const layout = useMemo(() => {
    const today = new Date(`${todayKeyStr}T00:00:00`);
    const dated = tasks.filter((tk) => tk.startDate || tk.dueDate);
    const keys = dated.flatMap((tk) => [
      tk.startDate ? isoToDateKey(tk.startDate) : null,
      tk.dueDate ? isoToDateKey(tk.dueDate) : null,
    ].filter(Boolean) as string[]);
    // 里程碑日期纳入范围，保证菱形不落在画布外
    keys.push(...milestones.map((ms) => isoToDateKey(ms.date)));
    const minKey = keys.length
      ? keys.reduce((a, b) => (a < b ? a : b))
      : dateKey(addDays(today, -7));
    const maxKey = keys.length
      ? keys.reduce((a, b) => (a > b ? a : b))
      : dateKey(addDays(today, 14));
    let start = new Date(`${minKey}T00:00:00`);
    let end = new Date(`${maxKey}T00:00:00`);
    // 起止各自留白；周/月缩放对齐到周初/月初
    start = zoom === "month" ? new Date(start.getFullYear(), start.getMonth(), 1) : addDays(startOfWeekMonday(start), zoom === "week" ? -7 : -3);
    end = zoom === "month" ? new Date(end.getFullYear(), end.getMonth() + 2, 0) : addDays(end, zoom === "week" ? 14 : 5);
    if (today < start) start = zoom === "month" ? new Date(today.getFullYear(), today.getMonth(), 1) : addDays(startOfWeekMonday(today), -3);
    if (today > end) end = addDays(today, 14);

    const totalDays = diffDays(start, end) + 1;
    const px = PX_PER_DAY[zoom];
    const totalWidth = totalDays * px;
    const xOf = (key: string) => diffDays(start, new Date(`${key}T00:00:00`)) * px;

    // 底部刻度行：日=每天 / 周=每周（周一）/ 月=每月；顶行由刻度聚合（月/年）
    const top: Span[] = [];
    const bottom: Span[] = [];
    const monthFmt = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", { year: "numeric", month: "short" });
    const dayFmt = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", { day: "numeric" });
    const mdFmt = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" });
    for (let i = 0; i < totalDays;) {
      const d = addDays(start, i);
      if (zoom === "month") {
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const days = Math.min(diffDays(d, monthEnd) + 1, totalDays - i);
        bottom.push({ key: `m${d.getFullYear()}-${d.getMonth()}`, label: monthFmt.format(d), days });
        i += days;
      } else if (zoom === "week") {
        const days = Math.min(7, totalDays - i);
        bottom.push({ key: `w${dateKey(d)}`, label: mdFmt.format(d), days });
        i += days;
      } else {
        const monthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const days = Math.min(monthDays - d.getDate() + 1, totalDays - i);
        for (let j = 0; j < days; j++) {
          const dd = addDays(d, j);
          bottom.push({
            key: dateKey(dd),
            label: dayFmt.format(dd),
            days: 1,
            weekend: dd.getDay() === 0 || dd.getDay() === 6,
          });
        }
        i += days;
      }
    }
    // 顶行聚合：日/周缩放按月；月缩放按年
    const dateOfKey = (key: string): Date => {
      const k = key.replace(/^w/, "");
      if (k.startsWith("m")) {
        const [y, m] = k.slice(1).split("-").map(Number);
        return new Date(y!, m! - 1, 1);
      }
      return new Date(`${k.slice(0, 10)}T00:00:00`);
    };
    const groupFmt = zoom === "month"
      ? new Intl.DateTimeFormat("en", { year: "numeric" })
      : monthFmt;
    for (const s of bottom) {
      const d = dateOfKey(s.key);
      const g = zoom === "month" ? `y${d.getFullYear()}` : `m${d.getFullYear()}-${d.getMonth()}`;
      const last = top.at(-1);
      if (last && last.key === g) last.days += s.days;
      else top.push({ key: g, label: groupFmt.format(d), days: s.days });
    }

    return { start, totalDays, px, totalWidth, xOf, top, bottom };
  }, [tasks, milestones, zoom, locale, todayKeyStr]);

  // 分组排序：父任务按起止日期排，其子任务紧随其后（缩进行展示）；父任务缺失的孤儿子任务按顶层兜底
  const rows = useMemo(() => {
    const byDate = (tk: Task) => tk.startDate ?? tk.dueDate ?? "9999";
    const parents = tasks
      .filter((tk) => !tk.parentId)
      .sort((a, b) => {
        const ka = byDate(a);
        const kb = byDate(b);
        return ka === kb ? a.order.localeCompare(b.order) : ka < kb ? -1 : 1;
      });
    const parentIds = new Set(parents.map((tk) => tk.id));
    const childrenOf = new Map<string, Task[]>();
    const orphans: Task[] = [];
    for (const tk of tasks) {
      if (!tk.parentId) continue;
      if (!parentIds.has(tk.parentId)) orphans.push(tk);
      else childrenOf.set(tk.parentId, [...(childrenOf.get(tk.parentId) ?? []), tk]);
    }
    const byDateCreated = (a: Task, b: Task) =>
      byDate(a) === byDate(b)
        ? a.createdAt.localeCompare(b.createdAt)
        : byDate(a) < byDate(b) ? -1 : 1;
    orphans.sort(byDateCreated);
    const result: { task: Task; sub: boolean }[] = [];
    for (const parent of parents) {
      result.push({ task: parent, sub: false });
      for (const child of (childrenOf.get(parent.id) ?? []).sort(byDateCreated)) {
        result.push({ task: child, sub: true });
      }
    }
    for (const tk of orphans) result.push({ task: tk, sub: false });
    return result;
  }, [tasks]);
  const rowIndexOf = new Map(rows.map((r, i) => [r.task.id, i]));

  function barGeom(task: Task) {
    const startKey = isoToDateKey(task.startDate ?? task.dueDate!);
    const endKey = isoToDateKey(task.dueDate ?? task.startDate!);
    const from = layout.xOf(startKey);
    const to = layout.xOf(endKey) + layout.px;
    // 天数 = 日历含首尾（如 9/28→10/2 为 5 天）再扣除区间内法定节假日；
    // 条带宽度仍按日历跨度绘制，扣减只影响标签上的数字
    const days = Math.max(
      0,
      diffDays(new Date(`${startKey}T00:00:00`), new Date(`${endKey}T00:00:00`)) + 1
        - countHolidays(startKey, endKey),
    );
    return { left: from, width: Math.max(layout.px, to - from), days };
  }

  const todayX = layout.xOf(todayKeyStr);
  const msLaneH = milestones.length > 0 ? MS_H : 0;
  const bodyH = rows.length * ROW_H;
  const frameTop = HEADER_H + msLaneH;
  const deps = links
    .filter((l) => l.type === "blocks")
    .map((l) => {
      const from = rows.find((r) => r.task.id === l.fromTaskId)?.task;
      const to = rows.find((r) => r.task.id === l.toTaskId)?.task;
      if (!from || !to) return null;
      if (!from.startDate && !from.dueDate) return null;
      if (!to.startDate && !to.dueDate) return null;
      const g1 = barGeom(from);
      const g2 = barGeom(to);
      const x1 = g1.left + g1.width;
      const y1 = (rowIndexOf.get(from.id) ?? 0) * ROW_H + ROW_H / 2;
      const x2 = g2.left;
      const y2 = (rowIndexOf.get(to.id) ?? 0) * ROW_H + ROW_H / 2;
      return { id: l.id, x1, y1, x2, y2 };
    })
    .filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number }[];

  return (
    <div className="tl">
      <div className="tl__scroll">
        <div className="tl__inner" style={{ width: NAME_W + layout.totalWidth }}>
          <div className="tl__header" style={{ height: HEADER_H }}>
            <div className="tl__corner tl__sticky">{t("colTitle")}</div>
            <div className="tl__scale" style={{ width: layout.totalWidth }}>
              <div className="tl__scale-top">
                {layout.top.map((s) => (
                  <div key={s.key} className="tl__span tl__span--top" style={{ width: s.days * layout.px }}>
                    {s.label}
                  </div>
                ))}
              </div>
              <div className="tl__scale-bottom">
                {layout.bottom.map((s) => (
                  <div
                    key={s.key}
                    className={`tl__span tl__span--bottom${s.weekend ? " is-weekend" : ""}`}
                    style={{ width: s.days * layout.px }}
                    title={s.key}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {milestones.length > 0 && (
            <div className="tl__ms" style={{ height: MS_H }} aria-label={t("tabMilestones")}>
              <div className="tl__corner tl__sticky tl__ms-name">{t("tabMilestones")}</div>
              <div className="tl__ms-lane" style={{ width: layout.totalWidth }}>
                {milestones.map((ms) => {
                  const key = isoToDateKey(ms.date);
                  const done = Boolean(ms.doneAt);
                  const overdue = !done && key < todayKeyStr;
                  return (
                    <span
                      key={ms.id}
                      className={`tl__ms-item${done ? " is-done" : ""}${overdue ? " is-overdue" : ""}`}
                      style={{ left: layout.xOf(key) + layout.px / 2 }}
                    >
                      <button
                        type="button"
                        className="tl__ms-diamond"
                        disabled={!canManageMilestones || !onToggleMilestone}
                        onClick={() => onToggleMilestone?.(ms)}
                        aria-label={t("toggleMilestoneAria", { name: ms.title })}
                        title={`${ms.title} · ${key}${done ? " ✓" : ""}`}
                      />
                      <span className="tl__ms-title">{ms.title}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="tl__body" style={{ height: bodyH }}>
            {/* 网格竖线 + 周末底纹 */}
            <div className="tl__grid" style={{ left: NAME_W, width: layout.totalWidth }}>
              {layout.bottom.map((s) => (
                <div
                  key={`g-${s.key}`}
                  className={`tl__grid-col${s.weekend ? " is-weekend" : ""}`}
                  style={{ width: s.days * layout.px }}
                />
              ))}
            </div>

            {rows.map((row, i) => {
              const task = row.task;
              const hasDates = Boolean(task.startDate || task.dueDate);
              const geom = hasDates ? barGeom(task) : null;
              const done = Boolean(task.completedAt);
              // 条带中央标“负责人 + 天数”，无负责人只标天数（天数已扣法定节假日）；
              // 条带过窄（<32px）时放下不显示
              const assignee = task.assigneeId ? assigneeNames[task.assigneeId] : undefined;
              return (
                <div key={task.id} className="tl__row" style={{ top: i * ROW_H, height: ROW_H }}>
                  <button
                    type="button"
                    className={`tl__name tl__sticky${done ? " is-done" : ""}${row.sub ? " tl__name--sub" : ""}`}
                    onClick={() => onOpenTask(task)}
                    title={task.title}
                  >
                    {task.title}
                  </button>
                  <div className="tl__lane">
                    {geom ? (
                      <button
                        type="button"
                        className={`tl__bar${done ? " is-done" : ""}${row.sub ? " tl__bar--sub" : ""}`}
                        style={{
                          left: geom.left,
                          width: geom.width,
                          height: row.sub ? BAR_SUB_H : BAR_H,
                          "--bar-c": statusColor(task.status),
                        } as CSSProperties}
                        onClick={() => onOpenTask(task)}
                        title={`${task.title}${task.dueDate ? ` · ${task.dueDate.slice(0, 10)}` : ""}`}
                        aria-label={task.title}
                      >
                        {geom.width >= 32 && (
                          <span className="tl__bar-label">
                            {assignee
                              ? `${assignee} ${t("tlBarDays", { n: geom.days })}`
                              : t("tlBarDays", { n: geom.days })}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="tl__nodate">{t("tlNoDates")}</span>
                    )}
                  </div>
                </div>
              );
            })}

            <svg
              className="tl__deps"
              style={{ left: NAME_W, width: layout.totalWidth, height: rows.length * ROW_H }}
              aria-hidden
            >
              <defs>
                <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="var(--color-text-faint)" />
                </marker>
              </defs>
              {deps.map((d) => {
                const bend = 10;
                const forward = d.x2 >= d.x1 + 12;
                const midX = forward ? (d.x1 + d.x2) / 2 : d.x1 + bend;
                const path = forward
                  ? `M ${d.x1} ${d.y1} H ${midX} V ${d.y2} H ${d.x2 - 2}`
                  : `M ${d.x1} ${d.y1} h ${bend} V ${(d.y1 + d.y2) / 2} H ${d.x2 - 14} V ${d.y2} H ${d.x2 - 2}`;
                return (
                  <path
                    key={d.id}
                    d={path}
                    className="tl__dep"
                    markerEnd="url(#tl-arrow)"
                    fill="none"
                  />
                );
              })}
            </svg>
          </div>

          {todayX >= 0 && todayX <= layout.totalWidth && (
            <div
              className="tl__today"
              style={{ top: frameTop, left: NAME_W + todayX, height: Math.max(bodyH, 1) }}
            >
              <span className="tl__today-label">{t("tlToday")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
