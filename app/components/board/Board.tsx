import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import { Column } from "./Column";

export interface MoveIntent {
  taskId: string;
  targetStatus: string;
  prevOrder: string | null;
  nextOrder: string | null;
}

export interface BoardProps {
  columns: StatusColumn[];
  tasks: Task[];
  onMove: (intent: MoveIntent) => void;
  onOpenTask: (task: Task) => void;
}

export function Board({ columns, tasks, onMove, onOpenTask }: BoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 屏幕阅读器播报拖拽结果
  const [announcement, setAnnouncement] = useState("");

  function tasksIn(status: string): Task[] {
    return tasks
      .filter((t) => t.status === status && !t.archived)
      .sort((a, b) => (a.order < b.order ? -1 : 1));
  }

  function handleDragEnd(event: DragEndEvent) {
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
    setAnnouncement(
      `已将「${task.title}」移动到「${columnName}」列`,
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
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
              onOpenTask={onOpenTask}
            />
          ))}
      </div>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </DndContext>
  );
}
