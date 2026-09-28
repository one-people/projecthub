import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { projectRepository } from "~/repositories/project.repository";
import { projectTemplateService } from "~/services/projectTemplate.service";
import { session } from "~/auth/session";
import { can, isProjectVisible, resolveRole } from "~/auth/rbac";
import { projectService } from "~/services/project.service";
import { trashService } from "~/services/trash.service";
import { useI18n, t as translate } from "~/lib/i18n";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";
import { tileColor } from "~/lib/palette";
import { Icon } from "~/components/ui/Icon";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { Project } from "~/models/project";
import type { ProjectTemplate } from "~/models/projectTemplate";
import type { User } from "~/models/user";

export const handle = { crumb: () => ({ label: translate("projects"), to: "/" }) };

interface CardStat {
  total: number;
  done: number;
}

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [stats, setStats] = useState<Record<string, CardStat>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [pendingDeleteTpl, setPendingDeleteTpl] = useState<ProjectTemplate | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [rows, us, user] = await Promise.all([
        projectRepository.list(),
        db.users.toArray(),
        session.currentUser(),
      ]);
      const byProject: Record<string, CardStat> = {};
      const tasks = await db.tasks.toArray();
      for (const task of tasks) {
        if (task.deletedAt) continue;
        const stat = (byProject[task.projectId] ??= { total: 0, done: 0 });
        stat.total += 1;
        if (task.completedAt) stat.done += 1;
      }
      return { rows, us, user, byProject };
    }).subscribe(({ rows, us, user, byProject }) => {
      // 私有制：非成员项目不在列表出现
      setProjects(user ? rows.filter((p) => isProjectVisible(p, user.id)) : []);
      setUsers(us);
      setMe(user);
      setStats(byProject);
    });
    return () => sub.unsubscribe();
  }, []);

  async function createDemo() {
    const project = await projectRepository.createDemo();
    navigate(`/projects/${project.id}/board`);
  }

  // 模板列表：内置 + 已保存（语言切换或模板增删时刷新）
  useEffect(() => {
    if (!showCreate) return;
    const sub = liveQuery(() => db.projectTemplates.toArray()).subscribe(() => {
      void projectTemplateService.list(locale).then(setTemplates);
    });
    void projectTemplateService.list(locale).then(setTemplates);
    return () => sub.unsubscribe();
  }, [showCreate, locale]);

  async function createFromTemplate(tpl: ProjectTemplate) {
    setShowCreate(false);
    try {
      const user = me ?? (await session.currentUser());
      const project = await projectTemplateService.instantiate(tpl, newName, user.id);
      setNewName("");
      toast.success(t("projectCreated", { name: project.name }));
      navigate(`/projects/${project.id}/board`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteTemplate() {
    if (!pendingDeleteTpl) return;
    try {
      const user = me ?? (await session.currentUser());
      await projectTemplateService.remove(user.id, pendingDeleteTpl.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setPendingDeleteTpl(null);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setEditName(p.name);
    setEditDesc(p.description ?? "");
  }

  async function saveEdit() {
    if (!editing || !me) return;
    try {
      await projectService.updateBasic(editing.id, me.id, {
        name: editName,
        description: editDesc,
      });
      toast.success(t("saved"));
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteProject() {
    const target = pendingDelete;
    if (!target || !me) return;
    setPendingDelete(null);
    try {
      await trashService.deleteProject(me.id, target.id);
      toast.success(t("deleted"), {
        undo: async () => {
          try {
            await trashService.restoreProject(me.id, target.id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1>{t("allProjects")}</h1>
        <span className="hint">
          {t("memberProjectsCount", { count: projects.length })}
        </span>
        <span className="page-toolbar__spacer" />
        <button className="btn" onClick={() => void createDemo()}>
          <Icon name="zap" size={16} />
          {t("createDemo")}
        </button>
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={16} />
          {t("newProject")}
        </button>
      </div>
      <ul className="project-list">
        {projects.map((p) => {
          const role = me ? resolveRole(p, me.id) : null;
          const canEdit = role ? can(role, "project:update") : false;
          const canDelete = role ? can(role, "project:delete") : false;
          const stat = stats[p.id] ?? { total: 0, done: 0 };
          // 成员含所有者；头像最多 5 个，超出显示 +N
          const memberUsers = [...new Set([p.ownerId, ...Object.keys(p.memberRoles)])]
            .map((id) => users.find((u) => u.id === id))
            .filter((u): u is User => Boolean(u));
          const visible = memberUsers.slice(0, 5);
          const overflow = memberUsers.length - visible.length;
          const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
          return (
            <li key={p.id}>
              <div
                className="project-card"
                style={{ "--tile": tileColor(p.id) } as CSSProperties}
                role="button"
                tabIndex={0}
                aria-label={t("openProjectAria", { name: p.name })}
                onClick={() => navigate(`/projects/${p.id}/board`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
                    navigate(`/projects/${p.id}/board`);
                  }
                }}
              >
                {(canEdit || canDelete) && (
                  <span className="project-card__actions">
                    {canEdit && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("editProjectAria", { name: p.name })}
                        title={t("editProject")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                      >
                        <Icon name="pencil" size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("deleteProjectAria", { name: p.name })}
                        title={t("deleteProject")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(p);
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </span>
                )}
                <span className="project-card__tile" aria-hidden>
                  {p.name.slice(0, 1)}
                </span>
                <span className="project-card__head">
                  <span className="project-card__name" title={p.name}>{p.name}</span>
                  {role && <span className="badge badge--role">{t(ROLE_LABEL_KEY[role])}</span>}
                </span>
                <span className="project-card__desc">{p.description ?? ""}</span>
                <span className="project-card__foot">
                  <span className="avatar-stack">
                    {visible.map((u) => (
                      <span
                        key={u.id}
                        className="avatar"
                        style={{ background: u.avatarColor }}
                        title={u.name}
                      >
                        {u.name.slice(0, 1)}
                      </span>
                    ))}
                    {overflow > 0 && <span className="avatar-stack__more">+{overflow}</span>}
                  </span>
                  <span className="project-card__count">
                    <Icon name="check" size={13} />
                    {t("progressLabel", { done: stat.done, total: stat.total })}
                  </span>
                </span>
                <span className="project-card__progress">
                  <span className="project-card__progress-track" aria-hidden>
                    <span
                      className="project-card__progress-bar"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="project-card__progress-label">{pct}%</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {projects.length === 0 && (
        <div className="empty">
          <Icon name="kanban" size={32} />
          <p>{t("noProjects")}</p>
        </div>
      )}

      {showCreate && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t("newProject")}>
            <div className="modal__header">
              <h2>{t("newProject")}</h2>
              <button className="icon-btn" aria-label={t("close")} onClick={() => setShowCreate(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <input
              className="input input--block"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("projectNamePlaceholder")}
              aria-label={t("projectNamePlaceholder")}
              onKeyDown={(e) => { if (e.key === "Escape") setShowCreate(false); }}
            />
            <p className="tpl-grid__hint">{t("fromTemplate")}</p>
            <div className="tpl-grid">
              {templates.map((tpl) => (
                <div key={tpl.id} className="tpl-card" style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="tpl-card__main"
                    aria-label={t("useTemplateAria", { name: tpl.name })}
                    onClick={() => void createFromTemplate(tpl)}
                  >
                    <span className="tpl-card__icon">
                      <Icon name={tpl.builtin ? "kanban" : "copy"} size={15} />
                    </span>
                    <span className="tpl-card__name">{tpl.name}</span>
                    <span className="tpl-card__desc">{tpl.description}</span>
                    <span className="tpl-card__meta">
                      {tpl.columns.length} {t("templateColumnsUnit")} · {tpl.taskTemplates.length} {t("templateTasksUnit")}
                    </span>
                  </button>
                  {!tpl.builtin && (
                    <button
                      type="button"
                      className="tpl-card__del icon-btn"
                      aria-label={t("deleteTemplateAria", { name: tpl.name })}
                      onClick={() => setPendingDeleteTpl(tpl)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteTpl !== null}
        title={t("deleteTemplateTitle")}
        message={t("confirmDeleteProjectTemplate", { name: pendingDeleteTpl?.name ?? "" })}
        danger
        onConfirm={() => void deleteTemplate()}
        onCancel={() => setPendingDeleteTpl(null)}
      />

      {editing && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t("editProject")}>
            <div className="modal__header">
              <h2>{t("editProject")}</h2>
              <button className="icon-btn" aria-label={t("close")} onClick={() => setEditing(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <label className="field-label form-field">
              {t("projectNameLabel")}
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("projectNameLabel")}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
              />
            </label>
            <label className="field-label form-field">
              {t("projectDescLabel")}
              <textarea
                className="input"
                style={{ resize: "vertical" }}
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </label>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setEditing(null)}>{t("cancel")}</button>
              <button
                className="btn btn--primary"
                disabled={!editName.trim()}
                onClick={() => void saveEdit()}
              >
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("deleteProject")}
        message={t("confirmDeleteProjectCard", { name: pendingDelete?.name ?? "" })}
        danger
        onConfirm={() => void deleteProject()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
