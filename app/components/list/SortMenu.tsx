import { t, useI18n } from "~/lib/i18n";
import type { Dict } from "~/locales/zh-CN";

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

const FIELDS: { value: SortField; labelKey: keyof Dict }[] = [
  { value: "title", labelKey: "colTitle" },
  { value: "assignee", labelKey: "colAssignee" },
  { value: "dueDate", labelKey: "colDueDate" },
  { value: "priority", labelKey: "colPriority" },
  { value: "updatedAt", labelKey: "colUpdatedAt" },
];

export function SortMenu({ rule, onChange }: SortMenuProps) {
  useI18n(); // 语言切换时重渲染
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label className="field-label">
        {t("sort")}
        <select
          className="input"
          value={rule.field}
          onChange={(e) => onChange({ ...rule, field: e.target.value as SortField })}
        >
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {t(f.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        onClick={() =>
          onChange({ ...rule, direction: rule.direction === "asc" ? "desc" : "asc" })
        }
        aria-label={t("sortDirectionAria", {
          direction: rule.direction === "asc" ? t("sortAsc") : t("sortDesc"),
        })}
      >
        {rule.direction === "asc" ? `↑ ${t("sortAsc")}` : `↓ ${t("sortDesc")}`}
      </button>
    </div>
  );
}
