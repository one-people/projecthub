import { useEffect, useState } from "react";
import { useOutletContext } from "@remix-run/react";
import { liveQuery } from "dexie";
import { Board } from "~/components/board/Board";
import { TaskDrawer } from "~/components/task/TaskDrawer";
import { taskService, PermissionError } from "~/services/task.service";
import { db } from "~/repositories/db";
import { can } from "~/auth/rbac";
import { uuid } from "~/lib/id";
import { t } from "~/lib/i18n";
import { useToast } from "~/components/ui/Toast";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: t("board") }) };

export default function BoardRoute() {
  const { project, role, actorId, users } = useOutletContext<ProjectOutletContext>();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.tasks.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setTasks(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.labels.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setLabels(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  const canCreate = can(role, "task:create");
  const canToggle = can(role, "task:update");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  function guard(e: unknown) {
    if (e instanceof PermissionError) {
      toast.error(e.message);
      return true;
    }
    return false;
  }

  async function handleMove(intent: {
    taskId: string;
    targetStatus: string;
    prevOrder: string | null;
    nextOrder: string | null;
  }) {
    // 乐观更新：本地先移动，失败则由 liveQuery 回读
    setTasks((prev) =>
      prev.map((t) =>
        t.id === intent.taskId ? { ...t, status: intent.targetStatus } : t,
      ),
    );
    try {
      await taskService.moveTask(
        actorId,
        role,
        intent.taskId,
        intent.targetStatus,
        intent.prevOrder,
        intent.nextOrder,
      );
    } catch (e) {
      guard(e);
    }
  }

  async function handleCreate(status: string, title: string) {
    try {
      await taskService.create(actorId, role, {
        id: uuid(),
        projectId: project.id,
        title,
        status,
      });
    } catch (e) {
      guard(e);
    }
  }

  async function handleToggleDone(task: Task, done: boolean) {
    try {
      await taskService.updateTask(actorId, role, task.id, { completed: done });
    } catch (e) {
      guard(e);
    }
  }

  return (
    <>
      <Board
        columns={project.statusColumns}
        tasks={tasks}
        users={users}
        labels={labels}
        canCreate={canCreate}
        canToggle={canToggle}
        onMove={handleMove}
        onOpenTask={(task) => setOpenTaskId(task.id)}
        onToggleDone={handleToggleDone}
        onCreate={handleCreate}
      />
      <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} onOpenTask={setOpenTaskId} />
    </>
  );
}
