import { useNavigate } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { Board } from "~/components/board/Board";
import { TaskDialog } from "~/components/task/TaskDialog";
import { taskService, PermissionError } from "~/services/task.service";
import { projectRepository } from "~/repositories/project.repository";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { can, type RoleId } from "~/auth/rbac";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";
import { uuid } from "~/lib/id";
import { Icon } from "~/components/ui/Icon";
import { t as translate } from "~/lib/i18n";

export const handle = { crumb: () => ({ label: translate("board") }) };

const ROLE_LABELS: Record<RoleId, string> = {
  admin: "管理员",
  projectAdmin: "项目管理员",
  member: "成员",
  guest: "只读访客",
};

export async function clientLoader({ params }: { params: { projectId: string } }) {
  const project = await projectRepository.get(params.projectId);
  if (!project) throw new Response("项目不存在", { status: 404 });
  const role = await session.roleIn(project);
  if (!can(role, "task:read")) throw new Response("无权访问该项目", { status: 403 });
  const tasks = await taskService.list(project.id);
  return { project, tasks, role };
}

export default function BoardRoute() {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [role, setRole] = useState<RoleId>("member");
  const [actorId, setActorId] = useState("");
  const [error, setError] = useState("");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    const params = { projectId: window.location.pathname.split("/")[2] ?? "" };
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const data = await clientLoader({ params });
        setProject(data.project);
        setRole(data.role);
        setActorId((await session.currentUser()).id);
        // liveQuery：本页与其他标签页对任务表的任何变更都会实时刷新
        const sub = liveQuery(() =>
          db.tasks.where("projectId").equals(data.project.id).toArray(),
        ).subscribe((rows) => setTasks(rows));
        unsubscribe = () => sub.unsubscribe();
      } catch (e) {
        if (e instanceof Response && e.status === 403) {
          setError("403：当前身份无权访问该项目");
        } else {
          navigate("/projects");
        }
      }
    })();
    return () => unsubscribe?.();
  }, [navigate]);

  const refresh = useCallback(async () => {
    if (!project) return;
    setTasks(await taskService.list(project.id));
  }, [project]);

  if (!project) return <main className="page"><p className="empty">{error || "加载中…"}</p></main>;
  const canCreate = can(role, "task:create");

  async function handleMove(intent: {
    taskId: string;
    targetStatus: string;
    prevOrder: string | null;
    nextOrder: string | null;
  }) {
    // 乐观更新：本地先移动，失败则回读
    const task = tasks.find((t) => t.id === intent.taskId);
    if (!task) return;
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
      setError("");
      setOpenTask(null);
    } catch (e) {
      if (e instanceof PermissionError) setError(e.message);
    } finally {
      await refresh();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !project) return;
    const firstColumn = project.statusColumns.find((c) => c.order === 0);
    if (!firstColumn) return;
    try {
      await taskService.create(actorId, role, {
        id: uuid(),
        projectId: project.id,
        title,
        status: firstColumn.id,
      });
      setNewTitle("");
      setError("");
    } catch (e) {
      if (e instanceof PermissionError) setError(e.message);
    }
    await refresh();
  }

  return (
    <main>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{project.name}</h1>
        <span className="badge badge--role" aria-label={`当前角色：${ROLE_LABELS[role]}`}>
          {ROLE_LABELS[role]}
        </span>
        <span className="page-toolbar__spacer" />
        <nav className="segmented" aria-label="视图切换">
          <span className="segmented__item segmented__item--active">
            <Icon name="kanban" size={15} />
            看板
          </span>
          <button
            className="segmented__item"
            onClick={() => navigate(`/projects/${project.id}/list`)}
          >
            <Icon name="list" size={15} />
            列表
          </button>
          <button
            className="segmented__item"
            onClick={() => navigate(`/projects/${project.id}/settings`)}
          >
            <Icon name="settings" size={15} />
            设置
          </button>
        </nav>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            style={{ width: 210 }}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="新任务标题，回车创建"
            aria-label="新任务标题"
            disabled={!canCreate}
            title={canCreate ? undefined : "当前角色无创建任务权限"}
          />
          <button className="btn btn--primary" type="submit" disabled={!canCreate}>
            <Icon name="plus" size={15} />
            新建任务
          </button>
        </form>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <Board
        columns={project.statusColumns}
        tasks={tasks}
        onMove={handleMove}
        onOpenTask={(t) => setOpenTask(t)}
      />
      <TaskDialog
        task={openTask ? tasks.find((t) => t.id === openTask.id) ?? openTask : null}
        statusName={
          project.statusColumns.find((c) => c.id === openTask?.status)?.name
        }
        onClose={() => setOpenTask(null)}
      />
    </main>
  );
}
