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
