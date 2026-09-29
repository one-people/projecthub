import { useState, type DragEvent } from "react";
import { Icon } from "~/components/ui/Icon";
import { PRIORITY_META } from "~/lib/priority";
import { isOverdue, localMidnightIso, type CalendarDay } from "~/lib/calendar";
import { holidayKeyOf } from "~/lib/holidays";
import type { Task } from "~/models/task";
import { useI18n } from "~/lib/i18n";

export interface CalendarViewProps {
  days: CalendarDay[];
  tasksByDay: Map<string, Task[]>;
  unscheduled: Task[];
  todayKey: string;
  weekdayLabels: string[];
  canEdit: boolean;
  canCreate: boolean;
  onOpenTask: (task: Task) => void;
  onPatch: (taskId: string, patch: Record<string, unknown>) => void;
  onCreate: (title: string, dayKey: string) => void;
}

const DRAG_MIME = "application/x-task-id";

export function CalendarView({
  days,
  tasksByDay,
  unscheduled,
  todayKey,
  weekdayLabels,
  canEdit,
  canCreate,
  onOpenTask,
  onPatch,
  onCreate,
}: CalendarViewProps) {
  const { t } = useI18n();
  const [creating, setCreating] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  function chipDragStart(e: DragEvent<HTMLButtonElement>, task: Task) {
    e.dataTransfer.setData(DRAG_MIME, task.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function dayDrop(e: DragEvent<HTMLDivElement>, dayKey: string) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id) onPatch(id, { dueDate: localMidnightIso(dayKey) });
  }

  function submitCreate(dayKey: string) {
    const title = newTitle.trim();
    if (title) onCreate(title, dayKey);
    setNewTitle("");
    setCreating(null);
  }

  const chip = (task: Task) => {
    const done = Boolean(task.completedAt);
    const overdue = isOverdue(task, todayKey);
    const color = overdue ? "var(--color-danger)" : PRIORITY_META[task.priority].color;
    return (
      <button
        key={task.id}
        type="button"
        className={`cal-chip${done ? " cal-chip--done" : ""}${overdue ? " cal-chip--overdue" : ""}`}
        draggable={canEdit}
        onDragStart={(e) => chipDragStart(e, task)}
        onClick={() => onOpenTask(task)}
        title={task.title}
      >
        <span className="cal-chip__dot" style={{ background: color }} />
        <span className="cal-chip__title">{task.title}</span>
      </button>
    );
  };

  return (
    <div className="cal-layout">
      <div className="cal-grid card" aria-label={t("calendarView")}>
        <div className="cal-grid__weekdays" role="row">
          {weekdayLabels.map((w, i) => (
            <div key={i} role="columnheader" className={`cal-weekday${i >= 5 ? " cal-weekday--end" : ""}`}>{w}</div>
          ))}
        </div>
        <div className="cal-grid__days">
          {days.map((d) => {
            const dayTasks = tasksByDay.get(d.key) ?? [];
            const holiday = holidayKeyOf(d.key);
            return (
              <div
                key={d.key}
                className={[
                  "cal-day",
                  d.inMonth ? "" : "cal-day--out",
                  d.isToday ? "cal-day--today" : "",
                  dragOver === d.key ? "cal-day--drag" : "",
                ].filter(Boolean).join(" ")}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOver(d.key);
                }}
                onDragLeave={() => setDragOver((k) => (k === d.key ? null : k))}
                onDrop={(e) => canEdit && dayDrop(e, d.key)}
              >
                <div className="cal-day__head">
                  <span className="cal-day__num">{d.date.getDate()}</span>
                  {/* 法定节假日名称提示，沿用中文日历“节日标红”的习惯 */}
                  {holiday && <span className="cal-day__holiday">{t(holiday)}</span>}
                  {canCreate && d.inMonth && (
                    <button
                      type="button"
                      className="cal-day__add"
                      onClick={() => { setCreating(d.key); setNewTitle(""); }}
                      aria-label={t("newTaskTitle")}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                </div>
                {creating === d.key ? (
                  <form
                    className="cal-day__form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitCreate(d.key);
                    }}
                  >
                    <input
                      autoFocus
                      className="input"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder={t("newTaskTitle")}
                      aria-label={t("newTaskTitle")}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setCreating(null);
                        if (e.key === "Enter") e.currentTarget.form?.requestSubmit();
                      }}
                      onBlur={() => submitCreate(d.key)}
                    />
                  </form>
                ) : (
                  dayTasks.map(chip)
                )}
              </div>
            );
          })}
        </div>
      </div>

      <aside
        className="cal-side card"
        aria-label={t("unscheduled")}
        onDragOver={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver("side");
        }}
        onDragLeave={() => setDragOver((k) => (k === "side" ? null : k))}
        onDrop={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragOver(null);
          const id = e.dataTransfer.getData(DRAG_MIME);
          if (id) onPatch(id, { dueDate: null });
        }}
      >
        <h3 className="cal-side__title">
          {t("unscheduled")}
          <span className="cal-side__count">{unscheduled.length}</span>
        </h3>
        <div className={`cal-side__list${dragOver === "side" ? " is-drag" : ""}`}>
          {unscheduled.length === 0 ? (
            <p className="cal-side__empty">{t("calAllScheduled")}</p>
          ) : (
            unscheduled.map(chip)
          )}
        </div>
      </aside>
    </div>
  );
}
