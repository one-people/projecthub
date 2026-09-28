import { useEffect, useRef, useState } from "react";
import {
  activeFilterChips,
  EMPTY_FILTERS,
  type Filters,
} from "~/lib/list-view";
import { useI18n } from "~/lib/i18n";

export interface FilterChipsProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  assigneeOptions: { id: string; name: string }[];
  labelOptions?: { id: string; name: string }[];
}

type PopoverKind = "add" | "assigneeId" | "due" | "priority" | "status" | "labelId" | null;

export function FilterChips({ filters, onChange, assigneeOptions, labelOptions = [] }: FilterChipsProps) {
  const { t } = useI18n();
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

  const chips = activeFilterChips(filters, assigneeOptions, labelOptions);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div
      ref={wrapRef}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setPopover(null);
      }}
    >
      {chips.map((chip) => (
        <span key={chip.key} className="db-popover__wrap">
          <button
            type="button"
            className="db-chip"
            aria-haspopup="dialog"
            aria-expanded={popover === chip.key}
            onClick={() => setPopover(popover === chip.key ? null : chip.key)}
          >
            {t(chip.labelKey)}
            <span className="db-chip__value">{chip.valueKey ? t(chip.valueKey) : chip.value}</span>
          </button>
          <button
            type="button"
            className="db-chip__x"
            aria-label={t("removeFilter", { label: t(chip.labelKey) })}
            onClick={() => {
              set({ [chip.key]: "all" } as Partial<Filters>);
              setPopover((p) => (p === chip.key ? null : p));
            }}
          >
            ×
          </button>
          {popover === chip.key && (
            <span className="db-popover" role="dialog">
              {renderEditor(chip.key, filters, set, assigneeOptions, labelOptions, t)}
            </span>
          )}
        </span>
      ))}
      <span className="db-popover__wrap">
        <button
          type="button"
          className="db-chip db-chip--add"
          aria-haspopup="dialog"
          aria-expanded={popover === "add"}
          onClick={() => setPopover(popover === "add" ? null : "add")}
        >
          {t("addFilter")}
        </button>
        {popover === "add" && (
          <span className="db-popover" role="dialog">
            {renderEditor("assigneeId", filters, set, assigneeOptions, labelOptions, t)}
            {renderEditor("due", filters, set, assigneeOptions, labelOptions, t)}
            {renderEditor("priority", filters, set, assigneeOptions, labelOptions, t)}
            {renderEditor("status", filters, set, assigneeOptions, labelOptions, t)}
            {labelOptions.length > 0 && renderEditor("labelId", filters, set, assigneeOptions, labelOptions, t)}
            <button className="btn btn--ghost" onClick={() => onChange(EMPTY_FILTERS)}>
              {t("resetAll")}
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
  labelOptions: { id: string; name: string }[],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (key === "assigneeId") {
    return (
      <label className="field-label">
        {t("colAssignee")}
        <select className="input" value={filters.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
          <option value="all">{t("all")}</option>
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
        {t("colDueDate")}
        <select className="input" value={filters.due} onChange={(e) => set({ due: e.target.value as Filters["due"] })}>
          <option value="all">{t("all")}</option>
          <option value="today">{t("dueToday")}</option>
          <option value="week">{t("dueWeek")}</option>
          <option value="overdue">{t("dueOverdue")}</option>
          <option value="none">{t("dueNone")}</option>
        </select>
      </label>
    );
  }
  if (key === "priority") {
    return (
      <label className="field-label">
        {t("colPriority")}
        <select className="input" value={filters.priority} onChange={(e) => set({ priority: e.target.value as Filters["priority"] })}>
          <option value="all">{t("all")}</option>
          <option value="urgent">{t("prioUrgent")}</option>
          <option value="high">{t("prioHigh")}</option>
          <option value="medium">{t("prioMedium")}</option>
          <option value="low">{t("prioLow")}</option>
          <option value="none">{t("prioNone")}</option>
        </select>
      </label>
    );
  }
  if (key === "labelId") {
    return (
      <label className="field-label">
        {t("fieldLabels")}
        <select className="input" value={filters.labelId} onChange={(e) => set({ labelId: e.target.value })}>
          <option value="all">{t("all")}</option>
          {labelOptions.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="field-label">
      {t("colStatus")}
      <select className="input" value={filters.status} onChange={(e) => set({ status: e.target.value as Filters["status"] })}>
        <option value="all">{t("all")}</option>
        <option value="open">{t("statusOpen")}</option>
        <option value="done">{t("statusDone")}</option>
      </select>
    </label>
  );
}
