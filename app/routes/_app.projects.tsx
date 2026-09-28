import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { projectRepository } from "~/repositories/project.repository";
import { projectTemplateService } from "~/services/projectTemplate.service";
import { session } from "~/auth/session";
import type { RoleId } from "~/auth/rbac";
import { useI18n, t as translate } from "~/lib/i18n";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";
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
      setProjects(rows);
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
      await projectTemplateService.remove(pendingDeleteTpl.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setPendingDeleteTpl(null);
  }

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("allProjects")}</h1>
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
          const role = (p.memberRoles[me?.id ?? ""] as RoleId | undefined) ?? null;
          const stat = stats[p.id] ?? { total: 0, done: 0 };
          const members = Object.keys(p.memberRoles)
            .map((id) => users.find((u) => u.id === id))
            .filter((u): u is User => Boolean(u))
            .slice(0, 5);
          const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
          return (
            <li key={p.id}>
              <div
                className="project-card"
                role="button"
                tabIndex={0}
                aria-label={t("openProjectAria", { name: p.name })}
                onClick={() => navigate(`/projects/${p.id}/board`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/projects/${p.id}/board`);
                }}
              >
                <span className="project-card__name">{p.name}</span>
                {p.description && <span className="project-card__desc">{p.description}</span>}
                <span className="project-card__meta">
                  <span className="avatar-stack">
                    {members.map((u) => (
                      <span
                        key={u.id}
                        className="avatar"
                        style={{ background: u.avatarColor }}
                        title={u.name}
                      >
                        {u.name.slice(0, 1)}
                      </span>
                    ))}
                  </span>
                  <span className="hint">{t("taskCountLabel", { count: stat.total })}</span>
                  <span className={`badge${role ? " badge--role" : ""}`}>
                    {role ? t(ROLE_LABEL_KEY[role]) : t("notMember")}
                  </span>
                </span>
                <span className="project-card__progress">
                  <span className="project-card__progress-track" aria-hidden>
                    <span
                      className="project-card__progress-bar"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="project-card__progress-label">
                    {t("progressLabel", { done: stat.done, total: stat.total })}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {projects.length === 0 && (
        <div className="empty">
          <Icon name="kanban" size={32} />
          <p style={{ margin: 0 }}>{t("noProjects")}</p>
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
              <h2 style={{ fontSize: 16, margin: 0 }}>{t("newProject")}</h2>
              <button className="icon-btn" aria-label={t("close")} onClick={() => setShowCreate(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <input
              className="input"
              style={{ width: "100%", marginTop: 12 }}
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
    </div>
  );
}
