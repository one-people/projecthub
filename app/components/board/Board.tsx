import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import { t } from "~/lib/i18n";
import { Column } from "./Column";
import { TaskCard } from "./TaskCard";

export interface MoveIntent {
  taskId: string;
  targetStatus: string;
  prevOrder: string | null;
  nextOrder: string | null;
}

export interface BoardProps {
  columns: StatusColumn[];
  tasks: Task[];
  users: { id: string; name: string }[];
  labels: Label[];
  canCreate: boolean;
  canToggle: boolean;
  onMove: (intent: MoveIntent) => void;
  onOpenTask: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onCreate: (status: string, title: string) => void;
}

export function Board({
  columns, tasks, users, labels, canCreate, canToggle, onMove, onOpenTask, onToggleDone, onCreate,
}: BoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 屏幕阅读器播报拖拽结果
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<Task | null>(null);

  const assigneeNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) map[u.id] = u.name;
    return map;
  }, [users]);

  function tasksIn(status: string): Task[] {
    return tasks
      .filter((t) => t.status === status && !t.archived)
      .sort((a, b) => (a.order < b.order ? -1 : 1));
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging(tasks.find((t) => t.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    const overData = over.data.current as
      | { type: "task"; status: string }
      | { type: "column"; status: string }
      | undefined;
    const targetStatus = overData?.status;
    if (!targetStatus) return;

    const columnTasks = tasksIn(targetStatus).filter((t) => t.id !== task.id);
    const overTaskId =
      overData?.type === "task" && over.id !== task.id ? String(over.id) : null;

    let prevOrder: string | null = null;
    let nextOrder: string | null = null;
    if (overTaskId) {
      const idx = columnTasks.findIndex((t) => t.id === overTaskId);
      if (idx >= 0) {
        prevOrder = columnTasks[idx - 1]?.order ?? null;
        nextOrder = columnTasks[idx]?.order ?? null;
      }
    } else if (columnTasks.length > 0) {
      prevOrder = columnTasks[columnTasks.length - 1]?.order ?? null;
    }

    onMove({ taskId: task.id, targetStatus, prevOrder, nextOrder });
    const columnName = columns.find((c) => c.id === targetStatus)?.name ?? targetStatus;
    setAnnouncement(t("movedAnnounce", { title: task.title, column: columnName }));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="board">
        {columns
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((column) => (
            <Column
              key={column.id}
              column={column}
              tasks={tasksIn(column.id)}
              assigneeNames={assigneeNames}
              labels={labels}
              canCreate={canCreate}
              canToggle={canToggle}
              onOpenTask={onOpenTask}
              onToggleDone={onToggleDone}
              onCreate={onCreate}
            />
          ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="task-card is-dragging">
            <p className="task-card__title">{dragging.title}</p>
          </div>
        )}
      </DragOverlay>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </DndContext>
  );
}
