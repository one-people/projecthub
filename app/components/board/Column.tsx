import { useState, type CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { StatusColumn } from "~/models/project";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import { statusColor } from "~/lib/list-view";
import { t } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { TaskCard } from "./TaskCard";

export interface ColumnProps {
  column: StatusColumn;
  tasks: Task[];
  assigneeNames: Record<string, string>;
  labels: Label[];
  canCreate: boolean;
  canToggle: boolean;
  onOpenTask: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onCreate: (status: string, title: string) => void;
}

/** 看板列：色点列头 + 计数 + 列内快捷创建 */
export function Column({
  column, tasks, assigneeNames, labels, canCreate, canToggle, onOpenTask, onToggleDone, onCreate,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", status: column.id },
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const doneCount = tasks.filter((t) => t.completedAt).length;

  function submit() {
    const title = draft.trim();
    if (title) onCreate(column.id, title);
    setDraft("");
  }

  return (
    <section
      className={`board-column${isOver ? " is-over" : ""}`}
      aria-label={`${column.name}（${tasks.length}）`}
      style={{ "--col-c": statusColor(column.id) } as CSSProperties}
    >
      <header className="board-column__header">
        <span className="board-column__dot" />
        <span className="board-column__name">{column.name}</span>
        <span className="board-column__count">{tasks.length}</span>
        <span
          className="board-column__progress"
          aria-hidden
          title={t("colProgressAria", { done: doneCount, total: tasks.length })}
        >
          <span style={{ width: tasks.length ? `${(doneCount / tasks.length) * 100}%` : "0%" }} />
        </span>
        {canCreate && (
          <button
            type="button"
            className="icon-btn board-column__add"
            onClick={() => { setAdding(true); setDraft(""); }}
            aria-label={t("addTaskInAria", { column: column.name })}
            title={t("addColumnTask")}
          >
            <Icon name="plus" size={15} />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className="board-column__body">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeName={task.assigneeId ? assigneeNames[task.assigneeId] ?? null : null}
              labels={labels}
              canToggle={canToggle}
              onOpen={onOpenTask}
              onToggleDone={onToggleDone}
            />
          ))}
        </SortableContext>
      </div>
      {canCreate && (
        adding ? (
          <input
            className="col-add__input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { submit(); setAdding(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }}
            placeholder={t("newTaskTitle")}
            aria-label={t("addTaskInAria", { column: column.name })}
          />
        ) : (
          <button type="button" className="col-add__trigger" onClick={() => { setAdding(true); setDraft(""); }}>
            <Icon name="plus" size={14} />
            {t("addColumnTask")}
          </button>
        )
      )}
    </section>
  );
}
