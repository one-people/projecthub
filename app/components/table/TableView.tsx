import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { StatusColumn, CustomField } from "~/models/project";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import { formatDate } from "~/lib/date";
import { t, useI18n } from "~/lib/i18n";
import { PRIORITY_META, PRIORITY_LABEL_KEY } from "~/lib/priority";
import { statusColor } from "~/lib/list-view";
import { Icon } from "~/components/ui/Icon";
import { uuid } from "~/lib/id";
import type { Dict } from "~/locales/zh-CN";

export interface TableViewProps {
  tasks: Task[];
  columns: StatusColumn[];
  assigneeNames: Record<string, string>;
  labels: Label[];
  customFields: CustomField[];
  /** 隐藏列 key 集合（"status"/"assignee"/…/custom:`${fieldId}`） */
  hidden: Set<string>;
  canEdit: boolean;
  canManageFields: boolean;
  onOpenTask: (task: Task) => void;
  onPatch: (taskId: string, patch: Record<string, unknown>) => void;
  onToggleColumn: (key: string) => void;
  onAddField: (field: CustomField) => void;
  onUpdateField: (fieldId: string, patch: Partial<CustomField>) => void;
  onDeleteField: (fieldId: string) => void;
}

const VIRTUALIZE_THRESHOLD = 100;
const ROW_HEIGHT = 40;

const FIELD_TYPE_LABEL: Record<CustomField["type"], keyof Dict> = {
  text: "fieldTypeText",
  number: "fieldTypeNumber",
  date: "fieldTypeDate",
  select: "fieldTypeSelect",
};

/** 自定义字段值为 unknown：仅基础类型直接展示，对象/数组序列化为 JSON，避免 "[object Object]" */
function displayValue(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v) ?? "";
}

/** 内置列定义：key 唯一，width 参与 grid 模板 */
const BUILTIN_COLS: { key: string; labelKey: "colStatus" | "colAssignee" | "colStart" | "colDueDate" | "colPriority" | "fieldLabels"; width: number }[] = [
  { key: "status", labelKey: "colStatus", width: 120 },
  { key: "assignee", labelKey: "colAssignee", width: 130 },
  { key: "startDate", labelKey: "colStart", width: 110 },
  { key: "dueDate", labelKey: "colDueDate", width: 110 },
  { key: "priority", labelKey: "colPriority", width: 92 },
  { key: "labels", labelKey: "fieldLabels", width: 170 },
];

type EditCell = { taskId: string; col: string } | null;

export function TableView({
  tasks, columns, assigneeNames, labels, customFields, hidden,
  canEdit, canManageFields, onOpenTask, onPatch, onToggleColumn,
  onAddField, onUpdateField, onDeleteField,
}: TableViewProps) {
  useI18n(); // 语言切换时重渲染
  const [edit, setEdit] = useState<EditCell>(null);
  const [colPopover, setColPopover] = useState<"columns" | "fields" | null>(null);
  const [fieldDraft, setFieldDraft] = useState({ name: "", type: "text" as CustomField["type"], options: "" });
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleBuiltin = BUILTIN_COLS.filter((c) => !hidden.has(c.key));
  const visibleCustom = customFields.filter((f) => !hidden.has(`custom:${f.id}`));

  const gridTemplate = useMemo(() => {
    const widths = [
      "minmax(220px, 1.6fr)",
      ...visibleBuiltin.map((c) => `${c.width}px`),
      ...visibleCustom.map((f) => (f.type === "number" ? "100px" : f.type === "date" ? "120px" : "140px")),
    ];
    return widths.join(" ");
  }, [visibleBuiltin, visibleCustom]);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // 子任务行标识：标题前加缩进图标，悬停提示父任务名
  const parentTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tk of tasks) map[tk.id] = tk.title;
    return map;
  }, [tasks]);

  useEffect(() => {
    if (!colPopover) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setColPopover(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [colPopover]);

  function saveCustom(task: Task, field: CustomField, raw: string) {
    let value: unknown = raw.trim() === "" ? undefined : raw.trim();
    if (value !== undefined && field.type === "number") {
      const n = Number(value);
      value = Number.isFinite(n) ? n : undefined;
    }
    const next = { ...(task.customValues ?? {}) };
    if (value === undefined) delete next[field.id];
    else next[field.id] = value;
    onPatch(task.id, { customValues: next });
  }

  function saveDate(task: Task, key: "startDate" | "dueDate", raw: string) {
    onPatch(task.id, { [key]: raw ? new Date(`${raw}T00:00:00`).toISOString() : null });
  }

  function submitField() {
    const name = fieldDraft.name.trim();
    if (!name) return;
    const options = fieldDraft.type === "select"
      ? fieldDraft.options.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
      : [];
    onAddField({ id: uuid(), name, type: fieldDraft.type, options });
    setFieldDraft({ name: "", type: "text", options: "" });
  }

  const row = (task: Task) => {
    const done = Boolean(task.completedAt);
    const statusCol = columns.find((c) => c.id === task.status);
    const taskLabels = labels.filter((l) => task.labels.includes(l.id));
    const editing = edit?.taskId === task.id ? edit.col : null;
    return (
      <div className="tv-grid tv-row" role="row" aria-label={task.title} style={{ gridTemplateColumns: gridTemplate }}>
        <div
          className={`tv-cell tv-cell--title${done ? " tv-cell--done" : ""}${task.parentId ? " tv-cell--sub" : ""}`}
          onClick={() => onOpenTask(task)}
          onKeyDown={(e) => { if (e.key === "Enter") onOpenTask(task); }}
          tabIndex={0}
          role="button"
          aria-label={t("openTaskAria", { title: task.title })}
          title={task.parentId
            ? t("parentTaskAria", { title: parentTitles[task.parentId] ?? "" })
            : undefined}
        >
          {task.parentId && (
            <Icon name="cornerDownRight" size={12} className="tv-cell__sub-icon" />
          )}
          {task.title}
        </div>

        {visibleBuiltin.map((col) => {
          const key = col.key;
          if (key === "status") {
            return canEdit ? (
              <select
                key={key}
                className="tv-select"
                value={task.status}
                disabled={!canEdit}
                onChange={(e) => onPatch(task.id, { status: e.target.value })}
                aria-label={t("colStatus")}
              >
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <span key={key} className="tv-cell">
                <span className="db-badge" style={{ "--db-c": statusColor(task.status) } as CSSProperties}>
                  {statusCol?.name ?? task.status}
                </span>
              </span>
            );
          }
          if (key === "assignee") {
            return canEdit ? (
              <select
                key={key}
                className="tv-select"
                value={task.assigneeId ?? ""}
                onChange={(e) => onPatch(task.id, { assigneeId: e.target.value || null })}
                aria-label={t("colAssignee")}
              >
                <option value="">{t("unassigned")}</option>
                {Object.entries(assigneeNames).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            ) : (
              <span key={key} className="tv-cell">{task.assigneeId ? assigneeNames[task.assigneeId] ?? t("unknownUser") : t("unassigned")}</span>
            );
          }
          if (key === "priority") {
            return canEdit ? (
              <select
                key={key}
                className="tv-select"
                value={task.priority}
                onChange={(e) => onPatch(task.id, { priority: e.target.value })}
                aria-label={t("colPriority")}
              >
                {(["urgent", "high", "medium", "low", "none"] as const).map((p) => (
                  <option key={p} value={p}>{t(PRIORITY_LABEL_KEY[p])}</option>
                ))}
              </select>
            ) : (
              <span key={key} className="tv-cell">
                <span className="db-prio" style={{ "--db-c": PRIORITY_META[task.priority].color } as CSSProperties}>
                  <span className="prio__dot" style={{ background: PRIORITY_META[task.priority].color }} />
                  {t(PRIORITY_LABEL_KEY[task.priority])}
                </span>
              </span>
            );
          }
          // 标签列：独立单元格渲染 chip
          if (key === "labels") {
            return taskLabels.length > 0 ? (
              <span key={key} className="tv-cell">
                <span className="db-row__labels db-row__labels--flush">
                  {taskLabels.map((l) => (
                    <span key={l.id} className="label-chip" style={{ "--chip-c": l.color } as CSSProperties}>{l.name}</span>
                  ))}
                </span>
              </span>
            ) : (
              <span key={key} className="tv-cell tv-cell--muted">—</span>
            );
          }
          // 日期列：点击进入行内 date 编辑
          const dateKey = key as "startDate" | "dueDate";
          const iso = task[dateKey];
          return editing === dateKey && canEdit ? (
            <input
              key={key}
              type="date"
              autoFocus
              className="tv-input"
              value={iso ? iso.slice(0, 10) : ""}
              onChange={(e) => saveDate(task, dateKey, e.target.value)}
              onBlur={() => setEdit(null)}
              onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setEdit(null); }}
              aria-label={t(dateKey === "startDate" ? "colStart" : "colDueDate")}
            />
          ) : (
            <button
              key={key}
              type="button"
              className={`tv-cell tv-cell--btn${iso ? "" : " is-empty"}`}
              onClick={() => canEdit && setEdit({ taskId: task.id, col: dateKey })}
            >
              {iso ? formatDate(iso) : t("dueNone")}
            </button>
          );
        })}

        {visibleCustom.map((field) => {
          const value = (task.customValues ?? {})[field.id];
          if (editing === `custom:${field.id}` && canEdit && field.type !== "select") {
            return (
              <input
                key={field.id}
                autoFocus
                className="tv-input"
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                value={
                  field.type === "date"
                    ? typeof value === "string" ? value.slice(0, 10) : ""
                    : displayValue(value)
                }
                onChange={(e) => saveCustom(task, field, e.target.value)}
                onBlur={() => setEdit(null)}
                onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setEdit(null); }}
                aria-label={field.name}
              />
            );
          }
          if (field.type === "select" && canEdit) {
            return (
              <select
                key={field.id}
                className="tv-select"
                value={typeof value === "string" ? value : ""}
                onChange={(e) => saveCustom(task, field, e.target.value)}
                aria-label={field.name}
              >
                <option value="">—</option>
                {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          }
          const display = value === undefined || value === null || value === ""
            ? "—"
            : field.type === "date" && typeof value === "string"
              ? formatDate(value)
              : displayValue(value);
          return (
            <button
              key={field.id}
              type="button"
              className={`tv-cell tv-cell--btn${display === "—" ? " is-empty" : ""}`}
              onClick={() => canEdit && field.type !== "select" && setEdit({ taskId: task.id, col: `custom:${field.id}` })}
            >
              {display}
            </button>
          );
        })}
      </div>
    );
  };

  const header = (
    <div className="tv-grid tv-header" role="row" style={{ gridTemplateColumns: gridTemplate }}>
      <div role="columnheader" className="tv-header__cell">{t("colTitle")}</div>
      {visibleBuiltin.map((c) => (
        <div key={c.key} role="columnheader" className="tv-header__cell">{t(c.labelKey)}</div>
      ))}
      {visibleCustom.map((f) => (
        <div key={f.id} role="columnheader" className="tv-header__cell">
          {f.name}
          <span className="tv-header__type">{t(FIELD_TYPE_LABEL[f.type])}</span>
        </div>
      ))}
    </div>
  );

  const rows = tasks.length <= VIRTUALIZE_THRESHOLD ? (
    <div role="table" aria-label={t("tableView")}>
      {header}
      {tasks.map((task) => <div key={task.id}>{row(task)}</div>)}
      {tasks.length === 0 && <p className="empty">{t("noMatch")}</p>}
    </div>
  ) : (
    <div>
      {header}
      <div ref={scrollRef} style={{ height: "60vh", overflowY: "auto" }} data-testid="virtual-table">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => (
            <div
              key={tasks[vi.index]!.id}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
            >
              {row(tasks[vi.index]!)}
            </div>
          ))}
        </div>
      </div>
      <p className="hint">{t("virtualized", { count: tasks.length })}</p>
    </div>
  );

  return (
    <div ref={wrapRef}>
      {rows}
      <div className="tv-toolbar">
        <span className="db-popover__wrap">
          <button
            type="button"
            className="db-chip db-chip--add"
            aria-haspopup="dialog"
            aria-expanded={colPopover === "columns"}
            onClick={() => setColPopover(colPopover === "columns" ? null : "columns")}
          >
            <Icon name="panel" size={13} />
            {t("columnVisibility")}
          </button>
          {colPopover === "columns" && (
            <span className="db-popover" role="dialog">
              {[...BUILTIN_COLS.map((c) => ({ key: c.key, name: t(c.labelKey) })),
                ...customFields.map((f) => ({ key: `custom:${f.id}`, name: f.name }))].map((c) => (
                <label key={c.key} className="popover__item popover__item--static">
                  <input
                    type="checkbox"
                    checked={!hidden.has(c.key)}
                    onChange={() => onToggleColumn(c.key)}
                  />
                  {c.name}
                </label>
              ))}
            </span>
          )}
        </span>
        {canManageFields && (
          <span className="db-popover__wrap">
            <button
              type="button"
              className="db-chip db-chip--add"
              aria-haspopup="dialog"
              aria-expanded={colPopover === "fields"}
              onClick={() => setColPopover(colPopover === "fields" ? null : "fields")}
            >
              <Icon name="plus" size={13} />
              {t("manageFields")}
            </button>
            {colPopover === "fields" && (
              <span className="db-popover db-popover--wide" role="dialog">
                {customFields.map((f) => (
                  <span key={f.id} className="tv-field-row">
                    <input
                      className="input"
                      defaultValue={f.name}
                      style={{ flex: 1, minWidth: 100 }}
                      onBlur={(e) => e.target.value.trim() && onUpdateField(f.id, { name: e.target.value.trim() })}
                      aria-label={f.name}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onDeleteField(f.id)}
                      aria-label={t("deleteFieldAria", { name: f.name })}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                ))}
                <form
                  className="popover__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitField();
                  }}
                >
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 90 }}
                    value={fieldDraft.name}
                    onChange={(e) => setFieldDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder={t("fieldName")}
                    aria-label={t("fieldName")}
                  />
                  <select
                    className="input"
                    value={fieldDraft.type}
                    onChange={(e) => setFieldDraft((d) => ({ ...d, type: e.target.value as CustomField["type"] }))}
                    aria-label={t("fieldType")}
                  >
                    {(Object.keys(FIELD_TYPE_LABEL) as CustomField["type"][]).map((ty) => (
                      <option key={ty} value={ty}>{t(FIELD_TYPE_LABEL[ty])}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn--primary" disabled={!fieldDraft.name.trim()}>
                    {t("add")}
                  </button>
                </form>
                {fieldDraft.type === "select" && (
                  <textarea
                    className="input"
                    rows={2}
                    value={fieldDraft.options}
                    onChange={(e) => setFieldDraft((d) => ({ ...d, options: e.target.value }))}
                    placeholder={t("selectOptionsHint")}
                    aria-label={t("selectOptions")}
                  />
                )}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
