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

export interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  assigneeOptions: { id: string; name: string }[];
}

export function FilterBar({ filters, onChange, assigneeOptions }: FilterBarProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label className="field-label">
        负责人
        <select
          className="input"
          value={filters.assigneeId}
          onChange={(e) => set({ assigneeId: e.target.value })}
        >
          <option value="all">全部</option>
          {assigneeOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        截止日期
        <select
          className="input"
          value={filters.due}
          onChange={(e) => set({ due: e.target.value as DueFilter })}
        >
          <option value="all">全部</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="overdue">已逾期</option>
          <option value="none">无日期</option>
        </select>
      </label>

      <label className="field-label">
        优先级
        <select
          className="input"
          value={filters.priority}
          onChange={(e) => set({ priority: e.target.value as Filters["priority"] })}
        >
          <option value="all">全部</option>
          <option value="urgent">紧急</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
          <option value="none">无</option>
        </select>
      </label>

      <label className="field-label">
        状态
        <select
          className="input"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value as StatusFilter })}
        >
          <option value="all">全部</option>
          <option value="open">未完成</option>
          <option value="done">已完成</option>
        </select>
      </label>

      <button className="btn btn--ghost" onClick={() => onChange(EMPTY_FILTERS)}>
        重置
      </button>
    </div>
  );
}
