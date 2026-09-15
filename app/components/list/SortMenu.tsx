export type SortField = "title" | "assignee" | "dueDate" | "priority" | "updatedAt";
export type SortDirection = "asc" | "desc";

export interface SortRule {
  field: SortField;
  direction: SortDirection;
}

export interface SortMenuProps {
  rule: SortRule;
  onChange: (rule: SortRule) => void;
}

const FIELDS: { value: SortField; label: string }[] = [
  { value: "title", label: "标题" },
  { value: "assignee", label: "负责人" },
  { value: "dueDate", label: "截止日期" },
  { value: "priority", label: "优先级" },
  { value: "updatedAt", label: "更新时间" },
];

export function SortMenu({ rule, onChange }: SortMenuProps) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label className="field-label">
        排序
        <select
          className="input"
          value={rule.field}
          onChange={(e) => onChange({ ...rule, field: e.target.value as SortField })}
        >
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        onClick={() =>
          onChange({ ...rule, direction: rule.direction === "asc" ? "desc" : "asc" })
        }
        aria-label={`排序方向：${rule.direction === "asc" ? "升序" : "降序"}，点击切换`}
      >
        {rule.direction === "asc" ? "↑ 升序" : "↓ 降序"}
      </button>
    </div>
  );
}
