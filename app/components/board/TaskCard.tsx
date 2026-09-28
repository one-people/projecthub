import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import { Icon } from "~/components/ui/Icon";
import { PRIORITY_META, PRIORITY_LABEL_KEY } from "~/lib/priority";
import { avatarColor } from "~/lib/list-view";
import { t, useI18n } from "~/lib/i18n";
import { isOverdue } from "~/lib/date";

export interface TaskCardProps {
  task: Task;
  assigneeName: string | null;
  labels: Label[];
  canToggle: boolean;
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function TaskCard({ task, assigneeName, labels, canToggle, onOpen, onToggleDone }: TaskCardProps) {
  const { locale } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", status: task.status } });

  const prio = PRIORITY_META[task.priority];
  const done = Boolean(task.completedAt);
  const cardLabels = labels.filter((l) => task.labels.includes(l.id));
  const overdue = task.dueDate ? isOverdue(task.dueDate) && !done : false;
  const dueToday = task.dueDate ? isSameDay(new Date(task.dueDate), new Date()) : false;
  const doneSubtasks = task.subtasks.filter((s) => s.done).length;

  const dueText = task.dueDate
    ? dueToday
      ? t("dueToday")
      : new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(new Date(task.dueDate))
    : null;

  return (
    <div
      ref={setNodeRef}
      className={`task-card${isDragging ? " is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      aria-label={t("cardAria", {
        title: task.title,
        priority: t(PRIORITY_LABEL_KEY[task.priority]),
      })}
    >
      <button
        type="button"
        className={`check${done ? " is-done" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(task, !done);
        }}
        disabled={!canToggle}
        aria-label={done ? t("markUndone") : t("markDone")}
        aria-pressed={done}
      >
        <Icon name="check" size={11} />
      </button>
      <div className="task-card__main">
        <p className={`task-card__title${done ? " task-card__title--done" : ""}`}>
          {task.title}
        </p>
        {cardLabels.length > 0 && (
          <div className="task-card__labels">
            {cardLabels.slice(0, 3).map((l) => (
              <span key={l.id} className="label-chip" style={{ "--chip-c": l.color } as CSSProperties}>
                {l.name}
              </span>
            ))}
            {cardLabels.length > 3 && (
              <span className="label-chip label-chip--more">+{cardLabels.length - 3}</span>
            )}
          </div>
        )}
        <div className="task-card__foot">
          <span
            className="prio__dot"
            style={{ background: prio.color }}
            title={t(PRIORITY_LABEL_KEY[task.priority])}
          />
          {dueText && (
            <span
              className={`task-card__due${overdue ? " task-card__due--overdue" : dueToday ? " task-card__due--today" : ""}`}
            >
              <Icon name="calendar" size={12} />
              {dueText}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="task-card__subt">
              <Icon name="check" size={11} />
              {doneSubtasks}/{task.subtasks.length}
            </span>
          )}
          {assigneeName && (
            <span
              className="task-card__assignee"
              style={{ background: avatarColor(assigneeName) }}
              title={assigneeName}
            >
              {assigneeName.charAt(0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
