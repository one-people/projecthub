# 列表页 Notion 式数据库视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目「列表」tab 重构为 Notion 式数据库视图：修复列错位、筛选 chips、富单元格、浮出批量操作条、表头排序。

**Architecture:** 纯展示层重构。新增 `app/lib/list-view.ts` 承载可测试的纯逻辑（色板哈希、chips 推导）；重写 `FilterBar`→`FilterChips`；`ListTable` 拆单元格组件并加表头排序；路由页改为 工具栏+表格+浮出操作条 布局。数据层 `lib/list-query.ts`、服务层、RBAC 不动。

**Tech Stack:** Remix 2 (SPA mode)、React 18、`@tanstack/react-virtual`、vitest（纯逻辑测试，无组件测试设施）。

**Spec:** `docs/superpowers/specs/2026-09-20-list-database-view-design.md`

---

### Task 1: `list-view.ts` 纯逻辑（TDD）

**Files:**
- Create: `app/lib/list-view.ts`
- Test: `tests/list-view.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/list-view.test.ts
import { describe, expect, it } from "vitest";
import {
  statusColor,
  avatarColor,
  activeFilterChips,
} from "~/lib/list-view";
import { EMPTY_FILTERS } from "~/components/list/FilterBar";

describe("statusColor", () => {
  it("同一列 id 返回同一颜色", () => {
    expect(statusColor("col-1")).toBe(statusColor("col-1"));
  });
  it("不同列 id 大概率返回不同颜色（抽样 8 个不重复率 > 1）", () => {
    const set = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(statusColor));
    expect(set.size).toBeGreaterThan(1);
  });
});

describe("avatarColor", () => {
  it("返回合法 hex 颜色", () => {
    expect(avatarColor("张三")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("activeFilterChips", () => {
  const opts = [{ id: "u1", name: "张三" }];
  it("无筛选时返回空数组", () => {
    expect(activeFilterChips(EMPTY_FILTERS, opts)).toEqual([]);
  });
  it("每个激活筛选产生一个 chip（key/label/value）", () => {
    const chips = activeFilterChips(
      { ...EMPTY_FILTERS, assigneeId: "u1", status: "done" },
      opts,
    );
    expect(chips).toEqual([
      { key: "assigneeId", label: "负责人", value: "张三" },
      { key: "status", label: "状态", value: "已完成" },
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/list-view.test.ts`
Expected: FAIL — `Cannot find module '~/lib/list-view'`

- [ ] **Step 3: 实现**

```ts
// app/lib/list-view.ts
import type { Filters } from "~/components/list/FilterBar";

// 单色系深浅色板（与全局 monochrome 风格协调的中性-强调色）
const PALETTE = [
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/list-view.test.ts`
Expected: PASS（3 个测试组全绿）

- [ ] **Step 5: Commit**

```bash
git add app/lib/list-view.ts tests/list-view.test.ts
git commit -m "feat: list view pure helpers (colors, filter chips)"
```

---

### Task 2: `.db-` 样式 + 修复列错位

**Files:**
- Modify: `app/styles/global.css`（替换 `/* ---------- 列表 ---------- */` 段落的 `.data-grid`/`.data-row` 等）

- [ ] **Step 1: 替换列表样式段**

将 global.css 中 `/* ---------- 列表 ---------- */` 到 `/* ---------- 弹窗 ---------- */` 之间的整段（`.data-grid`、`.data-grid__header`、`.data-row`、`.data-row:hover`、`.data-row--overdue`、`.data-row__title`、`.data-muted`）替换为：

```css
/* ---------- 列表（数据库视图） ---------- */
.db-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  flex-wrap: wrap;
}
.db-toolbar__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 220px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 13px;
}
.db-toolbar__search input {
  border: 0;
  outline: none;
  background: none;
  font: inherit;
  color: var(--color-text);
  width: 100%;
}
.db-toolbar__spacer { flex: 1; }

.db-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--color-surface-muted);
  border: 1px solid transparent;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.db-chip:hover { border-color: var(--color-border-strong); }
.db-chip__value { color: var(--color-text); font-weight: 500; }
.db-chip__x {
  display: inline-flex;
  border: 0;
  background: none;
  padding: 0;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
.db-chip__x:hover { color: var(--color-text); }
.db-chip--add { background: none; border-color: var(--color-border); }

.db-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.db-popover__wrap { position: relative; display: inline-flex; }

.db-grid {
  display: grid;
  grid-template-columns: 36px minmax(220px, 2fr) 130px 130px 110px 96px 110px;
  align-items: center;
  font-size: 13px;
  padding: 0 4px;
}
.db-grid__header {
  position: sticky;
  top: 0;
  z-index: 5;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--color-surface);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border-strong);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.db-grid__header--sortable {
  border: 0;
  background: none;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0;
}
.db-grid__header--sortable:hover { color: var(--color-text); }

.db-row {
  min-height: 40px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background var(--transition);
}
.db-row:hover { background: var(--color-surface-muted); }
.db-row__check { opacity: 0; transition: opacity var(--transition); }
.db-row:hover .db-row__check,
.db-row__check:checked { opacity: 1; }
.db-row__title { font-weight: 500; color: var(--color-text); }
.db-row__title--done {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.db-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: #fff;
}
.db-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.db-avatar--empty {
  border: 1px dashed var(--color-border-strong);
  background: none;
  color: var(--color-text-muted);
}
.db-assignee {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.db-assignee__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.db-due { color: var(--color-text-secondary); }
.db-due--today { color: var(--color-text); font-weight: 600; }
.db-due--overdue { color: var(--color-danger); font-weight: 500; }
.db-due__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 5px;
  vertical-align: 1px;
}
.db-prio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}
.db-muted {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.db-actionbar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-text);
  color: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
}
.db-actionbar__count { font-weight: 600; }
.db-actionbar__btn {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}
.db-actionbar__btn:hover { background: rgba(255, 255, 255, 0.12); }
.db-actionbar__btn--danger { color: #fca5a5; }
```

- [ ] **Step 2: 确认无残留旧类引用**

Run: `grep -rn "data-grid\|data-row\|data-muted" app/ || echo CLEAN`
Expected: `CLEAN`（Task 3/4 会替换所有使用处；若仍有输出，后续 task 会消除，最后一个 task 验证）

- [ ] **Step 3: Commit**

```bash
git add app/styles/global.css
git commit -m "style: db-view list styles (chips, badges, actionbar, sticky header)"
```

---

### Task 3: `FilterChips` 组件（替代 FilterBar）

**Files:**
- Create: `app/components/list/FilterChips.tsx`
- Delete: `app/components/list/FilterBar.tsx`（`Filters`/`EMPTY_FILTERS` 类型迁移，见 Step 3）

> 注意：`Filters`/`EMPTY_FILTERS`/`DueFilter`/`StatusFilter` 被 `list-query.ts`、路由页和 Task 1 的 `list-view.ts` 引用。为避免连锁改动，把它们移到 `app/lib/list-view.ts` 并全局更新 import。

- [ ] **Step 1: 类型迁移**

在 `app/lib/list-view.ts` 顶部加入（并从该文件导出）：

```ts
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
```

同时删除 `import type { Filters } from "~/components/list/FilterBar";` 一行（改为同文件定义）。更新引用方：`grep -rln "components/list/FilterBar" app/`，将这些文件中的 `from "~/components/list/FilterBar"` 改为 `from "~/lib/list-view"`（`list-query.ts`、路由页、`list-view.test.ts`）。

- [ ] **Step 2: 实现 FilterChips**

```tsx
// app/components/list/FilterChips.tsx
import { useEffect, useRef, useState } from "react";
import {
  activeFilterChips,
  EMPTY_FILTERS,
  type Filters,
} from "~/lib/list-view";

export interface FilterChipsProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  assigneeOptions: { id: string; name: string }[];
}

type PopoverKind = "add" | "assigneeId" | "due" | "priority" | "status" | null;

export function FilterChips({ filters, onChange, assigneeOptions }: FilterChipsProps) {
  const [popover, setPopover] = useState<PopoverKind>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPopover(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [popover]);

  const chips = activeFilterChips(filters, assigneeOptions);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div ref={wrapRef} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {chips.map((chip) => (
        <span key={chip.key} className="db-popover__wrap">
          <button
            type="button"
            className="db-chip"
            onClick={() => setPopover(popover === chip.key ? null : chip.key)}
          >
            {chip.label}
            <span className="db-chip__value">{chip.value}</span>
          </button>
          <button
            type="button"
            className="db-chip__x"
            aria-label={`移除筛选 ${chip.label}`}
            onClick={() => set({ [chip.key]: "all" } as Partial<Filters>)}
          >
            ×
          </button>
          {popover === chip.key && (
            <span className="db-popover" role="dialog">
              {renderEditor(chip.key, filters, set, assigneeOptions)}
            </span>
          )}
        </span>
      ))}
      <span className="db-popover__wrap">
        <button
          type="button"
          className="db-chip db-chip--add"
          onClick={() => setPopover(popover === "add" ? null : "add")}
        >
          + 筛选
        </button>
        {popover === "add" && (
          <span className="db-popover" role="dialog">
            {renderEditor("assigneeId", filters, set, assigneeOptions)}
            {renderEditor("due", filters, set, assigneeOptions)}
            {renderEditor("priority", filters, set, assigneeOptions)}
            {renderEditor("status", filters, set, assigneeOptions)}
            <button className="btn btn--ghost" onClick={() => onChange(EMPTY_FILTERS)}>
              重置全部
            </button>
          </span>
        )}
      </span>
    </div>
  );
}

function renderEditor(
  key: Exclude<PopoverKind, null | "add">,
  filters: Filters,
  set: (patch: Partial<Filters>) => void,
  assigneeOptions: { id: string; name: string }[],
) {
  if (key === "assigneeId") {
    return (
      <label className="field-label">
        负责人
        <select className="input" value={filters.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
          <option value="all">全部</option>
          {assigneeOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
    );
  }
  if (key === "due") {
    return (
      <label className="field-label">
        截止日期
        <select className="input" value={filters.due} onChange={(e) => set({ due: e.target.value as Filters["due"] })}>
          <option value="all">全部</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="overdue">已逾期</option>
          <option value="none">无日期</option>
        </select>
      </label>
    );
  }
  if (key === "priority") {
    return (
      <label className="field-label">
        优先级
        <select className="input" value={filters.priority} onChange={(e) => set({ priority: e.target.value as Filters["priority"] })}>
          <option value="all">全部</option>
          <option value="urgent">紧急</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
          <option value="none">无</option>
        </select>
      </label>
    );
  }
  return (
    <label className="field-label">
      状态
      <select className="input" value={filters.status} onChange={(e) => set({ status: e.target.value as Filters["status"] })}>
        <option value="all">全部</option>
        <option value="open">未完成</option>
        <option value="done">已完成</option>
      </select>
    </label>
  );
}
```

- [ ] **Step 3: 删除 FilterBar 并修引用**

```bash
rm app/components/list/FilterBar.tsx
grep -rn "FilterBar" app/   # 应无输出；路由页在 Task 5 改为 FilterChips
```

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck 报路由页仍 import FilterBar —— 属预期，本 task 仅需保证 `FilterChips.tsx` 与 `list-view.ts` 自身无类型错误。若要让 typecheck 全绿，可与 Task 5 合并提交；此时先运行 `npx vitest run tests/list-view.test.ts` 确认 PASS。

- [ ] **Step 5: Commit（与 Task 5 合并提交亦可）**

```bash
git add app/components/list/FilterChips.tsx app/lib/list-view.ts app/lib/list-query.ts tests/list-view.test.ts
git commit -m "feat: filter chips component with popover editors"
```

---

### Task 4: `ListTable` 重构（单元格组件 + 表头排序）

**Files:**
- Modify: `app/components/list/ListTable.tsx`（整文件重写）
- Modify: `app/components/list/SortMenu.tsx`（保留不动，表头排序与之共存）

- [ ] **Step 1: 重写 ListTable**

```tsx
// app/components/list/ListTable.tsx
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import { formatDate, formatRelative, isOverdue } from "~/lib/date";
import { t, useI18n } from "~/lib/i18n";
import { PRIORITY_META } from "~/lib/priority";
import { avatarColor, statusColor } from "~/lib/list-view";
import type { SortField, SortRule } from "~/components/list/SortMenu";

export interface ListTableProps {
  tasks: Task[];
  columns: StatusColumn[];
  assigneeNames: Record<string, string>;
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

// 可排序列头（状态列不支持排序——SortField 无 status，用纯文本列头）

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function StatusBadge({ task, columns }: { task: Task; columns: StatusColumn[] }) {
  const col = columns.find((c) => c.id === task.status);
  return (
    <span className="db-badge" style={{ background: statusColor(task.status) }}>
      {col?.name ?? task.status}
    </span>
  );
}

function AssigneeCell({ task, assigneeNames }: { task: Task; assigneeNames: Record<string, string> }) {
  if (!task.assigneeId) {
    return (
      <span className="db-assignee">
        <span className="db-avatar db-avatar--empty">?</span>
        <span className="db-muted">未指派</span>
      </span>
    );
  }
  const name = assigneeNames[task.assigneeId] ?? "未知";
  return (
    <span className="db-assignee">
      <span className="db-avatar" style={{ background: avatarColor(name) }}>
        {name.charAt(0)}
      </span>
      <span className="db-assignee__name">{name}</span>
    </span>
  );
}

function DueCell({ task }: { task: Task }) {
  if (!task.dueDate) return <span className="db-muted">无</span>;
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
    <span className="db-prio" style={{ background: `${prio.color}1A`, color: prio.color }}>
      <span className="prio__dot" style={{ background: prio.color }} />
      {prio.label}
    </span>
  );
}

function TaskCells({
  task, columns, assigneeNames, onOpenTask, selection,
}: Omit<ListTableProps, "tasks" | "sort" | "onSortChange"> & { task: Task }) {
  const done = Boolean(task.completedAt);
  return (
    <div
      className="db-grid db-row"
      onClick={() => onOpenTask(task)}
      tabIndex={0}
      role="button"
      aria-label={`打开任务 ${task.title}`}
      onKeyDown={(e) => { if (e.key === "Enter") onOpenTask(task); }}
    >
      <span onClick={(e) => e.stopPropagation()}>
        {selection ? (
          <input
            type="checkbox"
            className="db-row__check"
            checked={selection.selected.has(task.id)}
            onChange={() => selection.onToggle(task.id)}
            aria-label={`选择任务 ${task.title}`}
          />
        ) : null}
      </span>
      <span className={done ? "db-row__title db-row__title--done" : "db-row__title"}>
        {task.title}
      </span>
      <span><StatusBadge task={task} columns={columns} /></span>
      <span><AssigneeCell task={task} assigneeNames={assigneeNames} /></span>
      <span><DueCell task={task} /></span>
      <span><PriorityPill task={task} /></span>
      <span className="db-muted">{formatRelative(task.updatedAt)}</span>
    </div>
  );
}

export function ListTable({ tasks, columns, assigneeNames, onOpenTask, sort, onSortChange, selection }: ListTableProps) {
  useI18n(); // 语言切换时重渲染
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  function headerClick(field: SortField) {
    if (!onSortChange) return;
    if (sort?.field === field) {
      onSortChange({ field, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ field, direction: "asc" });
    }
  }

  const header = (
    <div className="db-grid" role="row">
      <div role="columnheader" className="db-grid__header">
        {selection ? (
          <input
            type="checkbox"
            checked={tasks.length > 0 && tasks.every((tk) => selection.selected.has(tk.id))}
            onChange={selection.onToggleAll}
            aria-label="全选任务"
          />
        ) : null}
      </div>
      {headerCells}
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
```

注意：`header` 的网格列数（复选框 1 + 数据 6 = 7）与 `.db-grid` 的 `grid-template-columns`（7 列）一致，原错位问题在此修复。状态列表头（`colStatus`）不排序（服务端 SortField 无 status），保持纯文本列头：在 `SORTABLE` 数组之外的实现方式——按上面代码，状态列未出现在 header 中是错的。修正：`SORTABLE` 列表头渲染顺序须为 标题/状态/负责人/截止/优先级/更新时间，状态列头为非按钮：

```tsx
const headerCells = (
  <>
    <div role="columnheader" className="db-grid__header">
      <button type="button" className="db-grid__header--sortable" onClick={() => headerClick("title")}>
        {t("colTitle" as never, undefined) || "标题"}
        {sort?.field === "title" ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </div>
    <div role="columnheader" className="db-grid__header">{t("colStatus" as never, undefined) || "状态"}</div>
    <div role="columnheader" className="db-grid__header">
      <button type="button" className="db-grid__header--sortable" onClick={() => headerClick("assignee")}>
        {t("colAssignee" as never, undefined) || "负责人"}
        {sort?.field === "assignee" ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </div>
    <div role="columnheader" className="db-grid__header">
      <button type="button" className="db-grid__header--sortable" onClick={() => headerClick("dueDate")}>
        {t("colDueDate" as never, undefined) || "截止日期"}
        {sort?.field === "dueDate" ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </div>
    <div role="columnheader" className="db-grid__header">
      <button type="button" className="db-grid__header--sortable" onClick={() => headerClick("priority")}>
        {t("colPriority" as never, undefined) || "优先级"}
        {sort?.field === "priority" ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </div>
    <div role="columnheader" className="db-grid__header">
      <button type="button" className="db-grid__header--sortable" onClick={() => headerClick("updatedAt")}>
        {t("colUpdatedAt" as never, undefined) || "更新时间"}
        {sort?.field === "updatedAt" ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </div>
  </>
);
```

实现时将 `headerCells` 定义放在 `header` 之前（组件内部），`SORTABLE` 数组不需要。

- [ ] **Step 2: 验证类型**

Run: `npm run typecheck`
Expected: 无 ListTable 相关错误（路由页错误在 Task 5 消除）

- [ ] **Step 3: Commit（可与 Task 5 合并）**

```bash
git add app/components/list/ListTable.tsx
git commit -m "feat: list table rich cells and header sorting"
```

---

### Task 5: 列表路由页改造（工具栏 + 浮出操作条 + 新建）

**Files:**
- Modify: `app/routes/_app.projects_.$projectId.list.tsx`

- [ ] **Step 1: 更新 import 与状态**

路由页改动：
1. import 区：`FilterBar` → `FilterChips`；`Filters` 从 `~/lib/list-view` 导入；新增 `taskService`、`uuid`（`~/lib/id`）、`can` 已有。
2. 新增状态：`const [search, setSearch] = useState("");`、`const [newTitle, setNewTitle] = useState("");`；`me` 状态改存 `{ id, role }`（已有，不变）。
3. `visible` 计算（替换原第 88 行）：

```tsx
const searched = search.trim()
  ? tasks.filter((tk) => tk.title.toLowerCase().includes(search.trim().toLowerCase()))
  : tasks;
const visible = applySort(applyFilters(searched, filters), sort);
```

- [ ] **Step 2: 替换 JSX（toolbar + 表格 + 浮出条 + 新建表单）**

将 return 中的 `<div className="toolbar">…</div>` 和表格区块整体替换为：

```tsx
<div className="db-toolbar">
  <label className="db-toolbar__search">
    <Icon name="search" size={14} />
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="搜索任务…"
      aria-label="搜索任务"
    />
  </label>
  <FilterChips
    filters={filters}
    onChange={(f) => updatePrefs({ filters: f })}
    assigneeOptions={Object.entries(assigneeNames).map(([id, name]) => ({ id, name }))}
  />
  <SortMenu rule={sort} onChange={(s) => updatePrefs({ sort: s })} />
  <span className="db-toolbar__spacer" />
  <form
    onSubmit={async (e) => {
      e.preventDefault();
      const title = newTitle.trim();
      if (!title || !project || !me) return;
      const firstColumn = project.statusColumns.find((c) => c.order === 0);
      if (!firstColumn) return;
      await taskService.create(me.id, me.role, {
        id: uuid(),
        projectId: project.id,
        title,
        status: firstColumn.id,
      });
      setNewTitle("");
    }}
    style={{ display: "flex", gap: 8 }}
  >
    <input
      className="input"
      style={{ width: 200 }}
      value={newTitle}
      onChange={(e) => setNewTitle(e.target.value)}
      placeholder="新任务标题，回车创建"
      aria-label="新任务标题"
    />
    <button className="btn btn--primary" type="submit">+ 新建</button>
  </form>
</div>
<div className="card" style={{ padding: "0 8px 8px", margin: "0 16px 16px" }} aria-label="任务列表">
  <ListTable
    tasks={visible}
    columns={project.statusColumns}
    assigneeNames={assigneeNames}
    onOpenTask={setOpenTask}
    sort={sort}
    onSortChange={(s) => updatePrefs({ sort: s })}
    selection={{
      selected,
      onToggle: (taskId) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(taskId)) next.delete(taskId);
          else next.add(taskId);
          return next;
        }),
      onToggleAll: () =>
        setSelected((prev) =>
          prev.size === visible.length ? new Set() : new Set(visible.map((tk) => tk.id)),
        ),
    }}
  />
</div>
{selected.size > 0 && (
  <div className="db-actionbar" role="toolbar" aria-label="批量操作">
    <span className="db-actionbar__count">已选 {selected.size} 项</span>
    {me && can(me.role, "task:delete") && (
      <button className="db-actionbar__btn db-actionbar__btn--danger" onClick={() => setConfirmBatch(true)}>
        {t("batchDelete")}
      </button>
    )}
    <button className="db-actionbar__btn" onClick={() => setSelected(new Set())}>
      取消
    </button>
  </div>
)}
```

`page-toolbar` 顶栏（项目名 + segmented 切换）保持不变。`ConfirmDialog`/`TaskDialog` 逻辑保持不变。

- [ ] **Step 3: 全量验证**

Run: `npm run typecheck && npx vitest run && npm run lint`
Expected: 全部通过；`grep -rn "data-grid\|data-row\|data-muted\|FilterBar" app/` 无输出

- [ ] **Step 4: 浏览器手动验证**

```bash
npm run dev
```

打开 `http://localhost:5173/projects/<某项目id>/list`，逐项核对：
- 表头与数据行 7 列对齐，无错位
- 搜索输入即筛；筛选 chip 出现/点击编辑/× 移除；+ 筛选弹层可选四类条件
- 表头点击「标题」等列：出现 ↑/↓ 且行序变化，与 SortMenu 同步
- hover 行显示复选框；勾选后底部浮出深色操作条；批量删除 → ConfirmDialog → undo toast 恢复
- 状态 badge 配色、负责人头像首字、逾期日期红字圆点、优先级 pill
- 切换语言（若页面有语言切换入口）表头文案变化
- 看板/列表/设置 三个 tab 互相切换正常

- [ ] **Step 5: Commit**

```bash
git add app/routes/_app.projects_.$projectId.list.tsx app/components/list/ app/lib/ app/styles/global.css
git commit -m "feat: Notion-style database list view"
```

---

## 自查记录

- Spec 覆盖：布局（Task 2/5）、单元格（Task 2/4）、交互（Task 4/5）、实现结构（Task 1-5）✓
- 类型一致性：`Filters`/`EMPTY_FILTERS` 统一迁移至 `lib/list-view.ts`（Task 1→3）；`SortRule`/`SortField` 沿用 `SortMenu.tsx` 定义 ✓
- 无占位符；每步含完整代码或精确命令 ✓
