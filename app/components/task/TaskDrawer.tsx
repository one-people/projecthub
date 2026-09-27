import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import type { Project, StatusColumn } from "~/models/project";
import type { Task, Priority, Subtask } from "~/models/task";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import type { AuditLog } from "~/models/auditLog";
import type { RoleId } from "~/auth/rbac";
import { can } from "~/auth/rbac";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { taskService, PermissionError, type TaskUpdatePatch } from "~/services/task.service";
import { commentService } from "~/services/comment.service";
import { auditService } from "~/services/audit.service";
import { trashService } from "~/services/trash.service";
import { RichTextEditor, renderRichText } from "~/components/editor/RichTextEditor";
import { CommentList } from "~/components/comments/CommentList";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Popover } from "~/components/ui/Popover";
import { useToast } from "~/components/ui/Toast";
import { Icon, type IconName } from "~/components/ui/Icon";
import { useI18n } from "~/lib/i18n";
import { PRIORITY_META, PRIORITY_LABEL_KEY } from "~/lib/priority";
import { statusColor } from "~/lib/list-view";
import { formatDate, formatRelative } from "~/lib/date";
import { uuid } from "~/lib/id";

export interface TaskDrawerProps {
  task: Task | null;
  onClose: () => void;
}

type Picker = "assignee" | "priority" | "status" | null;
type DetailTab = "comments" | "activity";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

/** 任务详情右侧抽屉（Worktile 式）：行内编辑字段 + 子任务 + 评论/动态 */
export function TaskDrawer({ task, onClose }: TaskDrawerProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [actor, setActor] = useState<{ id: string; role: RoleId } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<DetailTab>("comments");
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [titleDraft, setTitleDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState<JSONContent | null>(null);
  const [dueEditing, setDueEditing] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  const taskId = task?.id ?? null;

  // 打开时记录焦点并聚焦关闭按钮
  useEffect(() => {
    if (taskId) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    }
  }, [taskId]);

  // 项目 / 用户 / 身份随任务加载
  useEffect(() => {
    if (!task) return;
    void (async () => {
      const [p, us, me] = await Promise.all([
        db.projects.get(task.projectId),
        db.users.toArray(),
        session.currentUser(),
      ]);
      setProject(p ?? null);
      setUsers(us);
      setActor({ id: me.id, role: (p?.memberRoles[me.id] as RoleId | undefined) ?? "member" });
    })();
  }, [task?.projectId, taskId]);

  // 关闭时还原焦点
  useEffect(() => {
    return () => restoreRef.current?.focus?.();
  }, []);

  const refreshComments = useCallback(async () => {
    if (!taskId) return;
    setComments(await commentService.list(taskId));
  }, [taskId]);

  const refreshActivity = useCallback(async () => {
    if (!taskId) return;
    const rows = await auditService.list({ entityType: "task", limit: 300 });
    setActivity(rows.filter((r) => r.entityId === taskId));
  }, [taskId]);

  useEffect(() => {
    void refreshComments();
    void refreshActivity();
    setTitleDraft(task?.title ?? "");
    setEditingDesc(false);
    setDueEditing(false);
    setPicker(null);
    setTab("comments");
  }, [taskId, task, refreshComments, refreshActivity]);

  // Escape：优先关弹层 → 退出编辑 → 关抽屉
  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (picker) { setPicker(null); return; }
      if (editingDesc) { setEditingDesc(false); return; }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, picker, editingDesc, onClose]);

  if (!task || !project) return null;

  const canEdit = actor ? can(actor.role, "task:update") : false;
  const columns = [...project.statusColumns].sort((a, b) => a.order - b.order);
  const done = Boolean(task.completedAt);
  const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId) : undefined;
  const prio = PRIORITY_META[task.priority];
  const statusColumn = columns.find((c) => c.id === task.status);

  async function apply(patch: TaskUpdatePatch) {
    if (!actor || !task) return;
    try {
      await taskService.updateTask(actor.id, actor.role, task.id, patch);
    } catch (e) {
      toast.error(e instanceof PermissionError ? e.message : t("updateFailed"));
    }
  }

  function saveTitle() {
    const next = titleDraft.trim();
    if (!task) return;
    if (!next) {
      setTitleDraft(task.title);
      return;
    }
    if (next !== task.title) void apply({ title: next });
  }

  function toggleSubtask(st: Subtask) {
    if (!task) return;
    void apply({
      subtasks: task.subtasks.map((s) => (s.id === st.id ? { ...s, done: !s.done } : s)),
    });
  }

  function removeSubtask(st: Subtask) {
    if (!task) return;
    void apply({ subtasks: task.subtasks.filter((s) => s.id !== st.id) });
  }

  function addSubtask() {
    if (!task) return;
    const title = subtaskDraft.trim();
    if (!title) return;
    void apply({ subtasks: [...task.subtasks, { id: uuid(), title, done: false }] });
    setSubtaskDraft("");
  }

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

  const fieldRow = (icon: IconName, label: string, children: React.ReactNode) => (
    <div className="field-row">
      <span className="field-row__icon"><Icon name={icon} size={15} /></span>
      <span className="field-row__label">{label}</span>
      {children}
    </div>
  );

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t("taskDetailAria", { title: task.title })}
      >
        <div className="drawer__head">
          <button
            type="button"
            className={`check${done ? " is-done" : ""}`}
            onClick={() => void apply({ completed: !done })}
            disabled={!canEdit}
            aria-label={done ? t("markUndone") : t("markDone")}
            aria-pressed={done}
            title={done ? t("markUndone") : t("markDone")}
          >
            <Icon name="check" size={12} />
          </button>
          <div className="drawer__title">
            <input
              className={`drawer__title-input${done ? " drawer__title-input--done" : ""}`}
              value={titleDraft}
              disabled={!canEdit}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setTitleDraft(task.title);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label={t("editTitleAria")}
            />
          </div>
          {actor && can(actor.role, "task:delete") && (
            <button
              className="icon-btn"
              onClick={() => setConfirmDelete(true)}
              aria-label={t("deleteTask")}
              title={t("deleteTask")}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label={t("close")}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="drawer__body">
          {fieldRow("user", t("colAssignee"), (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className={`field-row__value${canEdit ? " field-row__value--editable" : ""}${!task.assigneeId ? " field-row__value--empty" : ""}`}
                onClick={() => canEdit && setPicker(picker === "assignee" ? null : "assignee")}
                aria-haspopup="dialog"
                aria-expanded={picker === "assignee"}
              >
                {assignee ? (
                  <>
                    <span className="avatar" style={{ background: assignee.avatarColor, width: 22, height: 22, fontSize: 11 }}>
                      {assignee.name.slice(0, 1)}
                    </span>
                    {assignee.name}
                  </>
                ) : (
                  t("unassigned")
                )}
                {canEdit && <Icon name="chevronDown" size={13} />}
              </button>
              <Popover open={picker === "assignee"} onClose={() => setPicker(null)} label={t("colAssignee")}>
                <button
                  type="button"
                  className="popover__item"
                  onClick={() => { setPicker(null); void apply({ assigneeId: null }); }}
                >
                  <Icon name="close" size={14} />
                  {t("clearAssignee")}
                </button>
                {users.filter((u) => u.active).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`popover__item${u.id === task.assigneeId ? " is-selected" : ""}`}
                    onClick={() => { setPicker(null); void apply({ assigneeId: u.id }); }}
                  >
                    <span className="avatar" style={{ background: u.avatarColor, width: 22, height: 22, fontSize: 11 }}>
                      {u.name.slice(0, 1)}
                    </span>
                    {u.name}
                  </button>
                ))}
              </Popover>
            </div>
          ))}

          {fieldRow("calendar", t("colDueDate"), (
            dueEditing && canEdit ? (
              <input
                type="date"
                className="input"
                autoFocus
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  void apply({ dueDate: v ? new Date(`${v}T00:00:00`).toISOString() : null });
                }}
                onBlur={() => setDueEditing(false)}
                onKeyDown={(e) => { if (e.key === "Escape") setDueEditing(false); }}
                aria-label={t("colDueDate")}
              />
            ) : (
              <button
                type="button"
                className={`field-row__value${canEdit ? " field-row__value--editable" : ""}${!task.dueDate ? " field-row__value--empty" : ""}`}
                onClick={() => canEdit && setDueEditing(true)}
              >
                {formatDate(task.dueDate, locale) ?? t("dueNone")}
              </button>
            )
          ))}

          {fieldRow("flag", t("colPriority"), (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className={`field-row__value${canEdit ? " field-row__value--editable" : ""}`}
                onClick={() => canEdit && setPicker(picker === "priority" ? null : "priority")}
                aria-haspopup="dialog"
                aria-expanded={picker === "priority"}
              >
                <span className="prio__dot" style={{ background: prio.color }} />
                {t(PRIORITY_LABEL_KEY[task.priority])}
                {canEdit && <Icon name="chevronDown" size={13} />}
              </button>
              <Popover open={picker === "priority"} onClose={() => setPicker(null)} label={t("colPriority")}>
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`popover__item${p === task.priority ? " is-selected" : ""}`}
                    onClick={() => { setPicker(null); void apply({ priority: p }); }}
                  >
                    <span className="prio__dot" style={{ background: PRIORITY_META[p].color }} />
                    {t(PRIORITY_LABEL_KEY[p])}
                  </button>
                ))}
              </Popover>
            </div>
          ))}

          {fieldRow("kanban", t("colStatus"), (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className={`field-row__value${canEdit ? " field-row__value--editable" : ""}`}
                onClick={() => canEdit && setPicker(picker === "status" ? null : "status")}
                aria-haspopup="dialog"
                aria-expanded={picker === "status"}
              >
                <span className="board-column__dot" style={{ "--col-c": statusColor(task.status) } as React.CSSProperties} />
                {statusColumn?.name ?? task.status}
                {canEdit && <Icon name="chevronDown" size={13} />}
              </button>
              <Popover open={picker === "status"} onClose={() => setPicker(null)} label={t("colStatus")}>
                {columns.map((c: StatusColumn) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`popover__item${c.id === task.status ? " is-selected" : ""}`}
                    onClick={() => { setPicker(null); void apply({ status: c.id }); }}
                  >
                    <span className="board-column__dot" style={{ "--col-c": statusColor(c.id) } as React.CSSProperties} />
                    {c.name}
                  </button>
                ))}
              </Popover>
            </div>
          ))}

          <section className="drawer__section" aria-label={t("fieldDescription")}>
            <h3 className="drawer__section-title">{t("fieldDescription")}</h3>
            {editingDesc && canEdit ? (
              <div>
                <RichTextEditor
                  key={`${task.id}-desc`}
                  users={users.map(({ id, name }) => ({ id, name }))}
                  content={(task.descriptionRich as JSONContent | null) ?? null}
                  onChange={setDescDraft}
                />
                <div className="confirm-actions" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => setEditingDesc(false)}>{t("cancel")}</button>
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      void apply({ descriptionRich: descDraft });
                      setEditingDesc(false);
                    }}
                  >
                    {t("save")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={`field-row__value${canEdit ? " field-row__value--editable" : ""}`}
                style={{ width: "100%", minHeight: 44, alignItems: "flex-start" }}
                onClick={() => { if (canEdit) { setDescDraft((task.descriptionRich as JSONContent | null) ?? null); setEditingDesc(true); } }}
              >
                {task.descriptionRich ? (
                  <span
                    style={{ width: "100%" }}
                    className="comment-body__rich"
                    dangerouslySetInnerHTML={{ __html: renderRichText(task.descriptionRich as never) }}
                  />
                ) : (
                  <span className="field-row__value--empty">{t("descriptionEmpty")}</span>
                )}
              </button>
            )}
          </section>

          <section className="drawer__section" aria-label={t("subtasks")}>
            <h3 className="drawer__section-title">
              {t("subtasks")}
              {task.subtasks.length > 0 && (
                <span className="subtask-progress" style={{ textTransform: "none" }}>
                  {t("subtaskProgress", {
                    done: task.subtasks.filter((s) => s.done).length,
                    total: task.subtasks.length,
                  })}
                </span>
              )}
            </h3>
            <ul className="subtask-list">
              {task.subtasks.map((st) => (
                <li key={st.id} className="subtask">
                  <button
                    type="button"
                    className={`check${st.done ? " is-done" : ""}`}
                    onClick={() => toggleSubtask(st)}
                    disabled={!canEdit}
                    aria-label={st.title}
                    aria-pressed={st.done}
                  >
                    <Icon name="check" size={11} />
                  </button>
                  <span className={`subtask__title${st.done ? " subtask__title--done" : ""}`}>{st.title}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="icon-btn subtask__del"
                      onClick={() => removeSubtask(st)}
                      aria-label={t("deleteSubtaskAria")}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form
                className="subtask-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addSubtask();
                }}
              >
                <Icon name="plus" size={14} />
                <input
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.target.value)}
                  placeholder={t("addSubtask")}
                  aria-label={t("addSubtask")}
                  style={{ border: 0, outline: "none", background: "none", font: "inherit", fontSize: 13, color: "var(--color-text)", width: "100%" }}
                />
              </form>
            )}
          </section>

          <section className="drawer__section" style={{ flex: 1 }} aria-label={t("tabComments")}>
            <nav className="tabs" aria-label={t("taskDetailAria", { title: task.title })}>
              <button
                type="button"
                className={`tabs__item${tab === "comments" ? " is-active" : ""}`}
                onClick={() => setTab("comments")}
              >
                {t("tabComments")}（{comments.length}）
              </button>
              <button
                type="button"
                className={`tabs__item${tab === "activity" ? " is-active" : ""}`}
                onClick={() => { setTab("activity"); void refreshActivity(); }}
              >
                {t("tabActivity")}（{activity.length}）
              </button>
            </nav>
            {tab === "comments" ? (
              actor ? (
                <div style={{ paddingTop: 8 }}>
                  <CommentList
                    comments={comments}
                    users={users}
                    actorId={actor.id}
                    actorRole={actor.role}
                    onAdd={addComment}
                    compact
                  />
                </div>
              ) : null
            ) : (
              <ul className="drawer-activity" style={{ marginTop: 8 }}>
                {activity.map((a) => (
                  <li key={a.id}>
                    <span>{a.summary}</span>
                    <time>{formatRelative(a.createdAt, locale)}</time>
                  </li>
                ))}
                {activity.length === 0 && <li className="hint" style={{ border: 0 }}>{t("noActivity")}</li>}
              </ul>
            )}
          </section>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          title={t("deleteTask")}
          message={t("confirmDeleteTask")}
          danger
          onConfirm={async () => {
            if (!task || !actor) return;
            try {
              await trashService.deleteTask(actor.id, actor.role, task.id);
              setConfirmDelete(false);
              onClose();
              toast.success(t("deleted"), {
                undo: () => trashService.restoreTask(actor.id, actor.role, task.id),
              });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t("updateFailed"));
            }
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      </aside>
    </>
  );
}
