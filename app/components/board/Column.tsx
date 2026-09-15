import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import { TaskCard } from "./TaskCard";

export interface ColumnProps {
  column: StatusColumn;
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}

export function Column({ column, tasks, onOpenTask }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", status: column.id },
  });

  return (
    <section className={`board-column${isOver ? " is-over" : ""}`} aria-label={`${column.name}列`}>
      <header className="board-column__header">
        <span className="board-column__name">{column.name}</span>
        <span className="board-column__count">{tasks.length}</span>
      </header>
      <div ref={setNodeRef} className="board-column__body">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isDone={column.isDone}
              onOpen={onOpenTask}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  );
}
