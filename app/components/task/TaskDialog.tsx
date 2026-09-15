import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "~/models/task";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import { formatDate } from "~/lib/date";
import { CommentList } from "~/components/comments/CommentList";
import { commentService } from "~/services/comment.service";
import { session } from "~/auth/session";
import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { Icon } from "~/components/ui/Icon";
import { PRIORITY_META } from "~/lib/priority";
import type { RoleId } from "~/auth/rbac";

export interface TaskDialogProps {
  task: Task | null;
  statusName?: string;
  onClose: () => void;
}

export function TaskDialog({ task, statusName, onClose }: TaskDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actor, setActor] = useState<{ id: string; role: RoleId } | null>(null);

  useEffect(() => {
    if (task) closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  const refreshComments = useCallback(async () => {
    if (!task) return;
    setComments(await commentService.list(task.id));
  }, [task]);

  useEffect(() => {
    void (async () => {
      const [u, me] = await Promise.all([
        db.users.toArray(),
        session.currentUser(),
      ]);
      setUsers(u);
      const project = task ? await db.projects.get(task.projectId) : undefined;
      const role = (project?.memberRoles[me.id] as RoleId | undefined) ?? "member";
      setActor({ id: me.id, role });
    })();
    void refreshComments();
  }, [task, refreshComments]);

  async function addComment(json: unknown) {
    if (!task || !actor) return;
    await commentService.create(actor.id, actor.role, {
      id: uuid(),
      taskId: task.id,
      authorId: actor.id,
      contentRich: json,
    });
    await refreshComments();
  }

  if (!task) return null;

  const prio = PRIORITY_META[task.priority];

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`任务详情：${task.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__header">
          <h2 style={{ fontSize: 18 }}>{task.title}</h2>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {statusName && <span className="badge badge--role">{statusName}</span>}
          <span className="prio">
            <span className="prio__dot" style={{ background: prio.color }} />
            {prio.label}
          </span>
          {task.completedAt && (
            <span className="badge">
              <Icon name="check" size={12} /> 已完成
            </span>
          )}
        </div>

        <dl className="detail-grid">
          <dt>负责人</dt>
          <dd>
            {task.assigneeId
              ? (users.find((u) => u.id === task.assigneeId)?.name ?? "未知")
              : "未指派"}
          </dd>
          <dt>截止日期</dt>
          <dd>{formatDate(task.dueDate) ?? "无"}</dd>
          <dt>子任务</dt>
          <dd>
            {task.subtasks.length === 0
              ? "无"
              : `${task.subtasks.filter((s) => s.done).length} / ${task.subtasks.length}`}
          </dd>
          <dt>描述</dt>
          <dd className="data-muted">
            {task.descriptionRich ? JSON.stringify(task.descriptionRich) : "暂无描述"}
          </dd>
        </dl>

        {actor && (
          <CommentList
            comments={comments}
            users={users}
            actorId={actor.id}
            actorRole={actor.role}
            onAdd={addComment}
          />
        )}
      </div>
    </div>
  );
}
