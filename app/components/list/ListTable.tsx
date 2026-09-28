import { useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import { formatDate, formatRelative, isOverdue } from "~/lib/date";
import { t, useI18n } from "~/lib/i18n";
import { PRIORITY_META } from "~/lib/priority";
import { avatarColor, statusColor } from "~/lib/list-view";
import type { Dict } from "~/locales/zh-CN";
import type { SortField, SortRule } from "~/components/list/SortMenu";

export interface ListTableProps {
  tasks: Task[];
  columns: StatusColumn[];
  assigneeNames: Record<string, string>;
  labelDefs?: Label[];
  onOpenTask: (task: Task) => void;
  sort?: SortRule;
  onSortChange?: (rule: SortRule) => void;
  selection?: {
    selected: Set<string>;
    onToggle: (taskId: string) => void;
    onToggleAll: () => void;
  };
}

const VIRTUALIZE_THRESHOLD = 100;
const ROW_HEIGHT = 40;

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

const PRIORITY_LABEL_KEY: Record<Task["priority"], keyof Dict> = {
  urgent: "prioUrgent", high: "prioHigh", medium: "prioMedium", low: "prioLow", none: "prioNone",
};

function StatusBadge({ task, columns }: { task: Task; columns: StatusColumn[] }) {
  const col = columns.find((c) => c.id === task.status);
  return (
    <span className="db-badge" style={{ "--db-c": statusColor(task.status) } as CSSProperties}>
      {col?.name ?? task.status}
    </span>
  );
}

function AssigneeCell({ task, assigneeNames }: { task: Task; assigneeNames: Record<string, string> }) {
  if (!task.assigneeId) {
    return (
      <span className="db-assignee">
        <span className="db-avatar db-avatar--empty">?</span>
        <span className="db-muted">{t("unassigned")}</span>
      </span>
    );
  }
  const name = assigneeNames[task.assigneeId] ?? t("unknownUser");
  return (
    <span className="db-assignee">
      <span className="db-avatar" style={{ "--db-c": avatarColor(name) } as CSSProperties}>
        {name.charAt(0)}
      </span>
      <span className="db-assignee__name">{name}</span>
    </span>
  );
}

function DueCell({ task }: { task: Task }) {
  if (!task.dueDate) return <span className="db-muted">{t("prioNone")}</span>;
  const overdue = isOverdue(task.dueDate) && !task.completedAt;
  const cls = overdue ? "db-due db-due--overdue" : isToday(task.dueDate) ? "db-due db-due--today" : "db-due";
  return (
    <span className={cls}>
      {overdue && <span className="db-due__dot" />}
      {formatDate(task.dueDate)}
    </span>
  );
}

function PriorityPill({ task }: { task: Task }) {
  const prio = PRIORITY_META[task.priority];
  return (
    <span className="db-prio" style={{ "--db-c": prio.color } as CSSProperties}>
      <span className="prio__dot" style={{ background: prio.color }} />
      {t(PRIORITY_LABEL_KEY[task.priority])}
    </span>
  );
}

function TaskCells({
  task, columns, assigneeNames, labelDefs = [], onOpenTask, selection,
}: Omit<ListTableProps, "tasks" | "sort" | "onSortChange"> & { task: Task }) {
  const done = Boolean(task.completedAt);
  const taskLabels = labelDefs.filter((l) => task.labels.includes(l.id));
  return (
    <div
      className="db-grid db-row"
      onClick={() => onOpenTask(task)}
      tabIndex={0}
      role="button"
      aria-label={t("openTaskAria", { title: task.title })}
      onKeyDown={(e) => { if (e.key === "Enter") onOpenTask(task); }}
    >
      <span onClick={(e) => e.stopPropagation()}>
        {selection ? (
          <input
            type="checkbox"
            className="db-row__check"
            checked={selection.selected.has(task.id)}
            onChange={() => selection.onToggle(task.id)}
            aria-label={t("selectTaskAria", { title: task.title })}
          />
        ) : null}
      </span>
      <span className={done ? "db-row__title db-row__title--done" : "db-row__title"}>
        {task.title}
        {taskLabels.length > 0 && (
          <span className="db-row__labels">
            {taskLabels.map((l) => (
              <span key={l.id} className="label-chip" style={{ "--chip-c": l.color } as CSSProperties}>
                {l.name}
              </span>
            ))}
          </span>
        )}
      </span>
      <span><StatusBadge task={task} columns={columns} /></span>
      <span><AssigneeCell task={task} assigneeNames={assigneeNames} /></span>
      <span><DueCell task={task} /></span>
      <span><PriorityPill task={task} /></span>
      <span className="db-muted">{formatRelative(task.updatedAt)}</span>
    </div>
  );
}

export function ListTable({ tasks, columns, assigneeNames, labelDefs, onOpenTask, sort, onSortChange, selection }: ListTableProps) {
  useI18n(); // 语言切换时重渲染
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  function headerClick(field: SortField) {
    if (!onSortChange || !sort) return;
    if (sort.field === field) {
      onSortChange({ field, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ field, direction: "asc" });
    }
  }

  // 可排序列头（状态列不支持排序——SortField 无 status，用纯文本列头）
  const sortableHeader = (field: SortField, labelKey: keyof Dict) => (
    <div role="columnheader" className="db-grid__header">
      <button
        type="button"
        className="db-grid__header--sortable"
        onClick={() => headerClick(field)}
        aria-label={t("sortBy", { field: t(labelKey) })}
      >
        {t(labelKey)}
        {sort?.field === field ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </div>
  );

  const header = (
    <div className="db-grid" role="row">
      <div role="columnheader" className="db-grid__header">
        {selection ? (
          <input
            type="checkbox"
            checked={tasks.length > 0 && tasks.every((tk) => selection.selected.has(tk.id))}
            onChange={selection.onToggleAll}
            aria-label={t("selectAllTasks")}
          />
        ) : null}
      </div>
      {sortableHeader("title", "colTitle")}
      <div role="columnheader" className="db-grid__header">{t("colStatus")}</div>
      {sortableHeader("assignee", "colAssignee")}
      {sortableHeader("dueDate", "colDueDate")}
      {sortableHeader("priority", "colPriority")}
      {sortableHeader("updatedAt", "colUpdatedAt")}
    </div>
  );

  if (tasks.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div role="table" aria-label={t("taskList")}>
        {header}
        {tasks.map((task) => (
          <TaskCells
            key={task.id}
            task={task}
            columns={columns}
            assigneeNames={assigneeNames}
            labelDefs={labelDefs}
            onOpenTask={onOpenTask}
            selection={selection}
          />
        ))}
        {tasks.length === 0 && <p className="empty">{t("noMatch")}</p>}
      </div>
    );
  }

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
                labelDefs={labelDefs}
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
