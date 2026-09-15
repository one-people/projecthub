import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "~/models/task";
import { Icon } from "~/components/ui/Icon";
import { PRIORITY_META } from "~/lib/priority";

export interface TaskCardProps {
  task: Task;
  isDone: boolean;
  onOpen: (task: Task) => void;
}

export function TaskCard({ task, isDone, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", status: task.status } });

  const prio = PRIORITY_META[task.priority];

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
      onDoubleClick={() => onOpen(task)}
      aria-label={`任务：${task.title}，优先级${prio.label}，双击查看详情`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isDone && <Icon name="check" size={14} className="data-muted" />}
        <span className={`task-card__title${isDone ? " task-card__title--done" : ""}`}>
          {task.title}
        </span>
      </div>
      <div className="task-card__meta">
        <span className="prio">
          <span className="prio__dot" style={{ background: prio.color }} />
          {prio.label}
        </span>
        {task.dueDate && (
          <span className="data-muted" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <Icon name="calendar" size={13} />
            {task.dueDate.slice(0, 10)}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="data-muted">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        )}
      </div>
    </div>
  );
}
