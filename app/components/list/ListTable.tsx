import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import { formatDate, formatRelative, isOverdue } from "~/lib/date";
import { t, useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { PRIORITY_META } from "~/lib/priority";

export interface ListTableProps {
  tasks: Task[];
  columns: StatusColumn[];
  assigneeNames: Record<string, string>;
  onOpenTask: (task: Task) => void;
  selection?: {
    selected: Set<string>;
    onToggle: (taskId: string) => void;
    onToggleAll: () => void;
  };
}

const VIRTUALIZE_THRESHOLD = 100;
const ROW_HEIGHT = 44;
const GRID_COLS = "36px minmax(200px, 2fr) 110px 110px 110px 90px 110px";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const priorityRank = (p: string) => PRIORITY_ORDER[p] ?? 9;

function TaskCells({
  task,
  columns,
  assigneeNames,
  onOpenTask,
  selection,
}: Omit<ListTableProps, "tasks"> & { task: Task }) {
  const overdue = isOverdue(task.dueDate) && !task.completedAt;
  const prio = PRIORITY_META[task.priority];
  return (
    <div
      className={`data-grid data-row${overdue ? " data-row--overdue" : ""}`}
      onClick={() => onOpenTask(task)}
      tabIndex={0}
      role="button"
      aria-label={`打开任务 ${task.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpenTask(task);
      }}
    >
      <span onClick={(e) => e.stopPropagation()}>
        {selection ? (
          <input
            type="checkbox"
            checked={selection.selected.has(task.id)}
            onChange={() => selection.onToggle(task.id)}
            aria-label={`选择任务 ${task.title}`}
          />
        ) : null}
      </span>
      <span className="data-row__title" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {task.completedAt ? (
          <Icon name="check" size={14} className="data-muted" />
        ) : null}
        {task.title}
      </span>
      <span>{columns.find((c) => c.id === task.status)?.name ?? task.status}</span>
      <span>
        {task.assigneeId ? (assigneeNames[task.assigneeId] ?? "未知") : "未指派"}
      </span>
      <span>{formatDate(task.dueDate) ?? "无"}</span>
      <span className="prio">
        <span className="prio__dot" style={{ background: prio.color }} />
        {prio.label}
      </span>
      <span className="data-muted">{formatRelative(task.updatedAt)}</span>
    </div>
  );
}

export function ListTable({ tasks, columns, assigneeNames, onOpenTask, selection }: ListTableProps) {
  useI18n(); // 语言切换时重渲染
  const headers: [string, string][] = [
    ["", ""],
    ["colTitle", "标题"],
    ["colStatus", "状态"],
    ["colAssignee", "负责人"],
    ["colDueDate", "截止日期"],
    ["colPriority", "优先级"],
    ["colUpdatedAt", "更新时间"],
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const header = (
    <div className="data-grid" role="row" style={{ gridTemplateColumns: GRID_COLS }}>
      <div role="columnheader" className="data-grid__header">
        {selection ? (
          <input
            type="checkbox"
            checked={tasks.length > 0 && tasks.every((tk) => selection.selected.has(tk.id))}
            onChange={selection.onToggleAll}
            aria-label="全选任务"
          />
        ) : null}
      </div>
      {headers.slice(1).map(([key, fallback]) => (
        <div
          key={key}
          role="columnheader"
          className="data-grid__header"
        >
          {t(key as never, undefined) || fallback}
        </div>
      ))}
    </div>
  );

  if (tasks.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div role="table" aria-label="任务列表">
        {header}
        {tasks.map((task) => (
          <TaskCells
            key={task.id}
            task={task}
            columns={columns}
            assigneeNames={assigneeNames}
            onOpenTask={onOpenTask}
            selection={selection}
          />
        ))}
        {tasks.length === 0 && (
          <p className="empty">{t("noMatch")}</p>
        )}
      </div>
    );
  }

  // 超过阈值启用虚拟滚动：只渲染可视区域行
  return (
    <div>
      {header}
      <div ref={scrollRef} style={{ height: "60vh", overflowY: "auto" }} data-testid="virtual-list">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => (
            <div
              key={tasks[vi.index]!.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <TaskCells
                task={tasks[vi.index]!}
                columns={columns}
                assigneeNames={assigneeNames}
                onOpenTask={onOpenTask}
                selection={selection}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="hint">{t("virtualized", { count: tasks.length })}</p>
    </div>
  );
}
