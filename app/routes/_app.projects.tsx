import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { projectRepository } from "~/repositories/project.repository";
import { session } from "~/auth/session";
import type { RoleId } from "~/auth/rbac";
import { useI18n, t as translate } from "~/lib/i18n";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";
import { Icon } from "~/components/ui/Icon";
import type { Project } from "~/models/project";
import type { User } from "~/models/user";

export const handle = { crumb: () => ({ label: translate("projects"), to: "/" }) };

interface CardStat {
  total: number;
  done: number;
}

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [stats, setStats] = useState<Record<string, CardStat>>({});

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

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("allProjects")}</h1>
        <span className="page-toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => void createDemo()}>
          <Icon name="plus" size={16} />
          {t("createDemo")}
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
    </div>
  );
}
