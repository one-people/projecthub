import { useNavigate } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import { projectRepository } from "~/repositories/project.repository";
import { session } from "~/auth/session";
import { db } from "~/repositories/db";
import type { Project } from "~/models/project";
import type { User } from "~/models/user";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  projectAdmin: "项目管理员",
  member: "成员",
  guest: "只读访客",
};

export default function ProjectList() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    const [ps, us, current] = await Promise.all([
      projectRepository.list(),
      db.users.toArray(),
      session.currentUser(),
    ]);
    setProjects(ps);
    setUsers(us);
    setMe(current);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createDemo() {
    const project = await projectRepository.createDemo();
    await refresh();
    navigate(`/projects/${project.id}/board`);
  }

  async function switchUser(userId: string) {
    await session.switchUser(userId);
    await refresh();
  }

  return (
    <main className="page">
      <div className="page-toolbar">
        <span className="brand">
          <span className="brand__mark">
            <Icon name="brand" size={16} />
          </span>
          ProjectHub
        </span>
        <span className="page-toolbar__spacer" />
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("/notifications");
          }}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}
        >
          <Icon name="bell" size={16} />
          {t("notifications")}
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("/settings");
          }}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}
        >
          <Icon name="settings" size={16} />
          {t("settings")}
        </a>
      </div>

      <p className="hint" style={{ margin: "8px 0 0" }}>{t("appTagline")}</p>

      {users.length > 0 && me && (
        <div className="page-toolbar" style={{ marginTop: 16 }}>
          <label className="field-label">
            <Icon name="user" size={15} />
            {t("currentUser")}
            <select
              className="input"
              value={me.id}
              onChange={(e) => void switchUser(e.target.value)}
              aria-label={t("currentUser")}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id}>
            <div
              className="project-card"
              role="button"
              tabIndex={0}
              aria-label={`打开项目 ${p.name}`}
              onClick={() => navigate(`/projects/${p.id}/board`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/projects/${p.id}/board`);
              }}
            >
              <span className="project-card__name">{p.name}</span>
              <span className="project-card__meta">
                <span>{p.description}</span>
                <span className="badge badge--role">
                  {t("myRole")}：{ROLE_LABELS[p.memberRoles[me?.id ?? ""] ?? ""] ?? "非成员"}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {projects.length === 0 ? (
        <div className="empty">
          <Icon name="kanban" size={32} />
          <p style={{ margin: 0 }}>{t("noProjects")}</p>
          <button className="btn btn--primary" onClick={createDemo}>
            <Icon name="plus" size={16} />
            {t("createDemo")}
          </button>
        </div>
      ) : (
        <button className="btn" onClick={createDemo}>
          <Icon name="plus" size={16} />
          {t("createDemo")}
        </button>
      )}
    </main>
  );
}
