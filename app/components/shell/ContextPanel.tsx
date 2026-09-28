import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { resolveRole } from "~/auth/rbac";
import { projectRepository } from "~/repositories/project.repository";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";

/** 二级导航面板：我的项目全列表 + 筛选 + 新建 */
export function ContextPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const sub = liveQuery(async () => {
      const me = await session.currentUser();
      const rows = await db.projects.toArray();
      return rows
        .filter((p) => !p.deletedAt && resolveRole(p, me.id) !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({ id: p.id, name: p.name }));
    }).subscribe(setProjects);
    return () => sub.unsubscribe();
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, filter]);

  async function createProject() {
    const project = await projectRepository.createDemo();
    navigate(`/projects/${project.id}/board`);
  }

  return (
    <aside className="panel" aria-label={t("myProjects")}>
      <div className="panel__head">
        <p className="panel__title">{t("projects")}</p>
        <button
          className="icon-btn"
          onClick={() => void createProject()}
          aria-label={t("newProject")}
          title={t("newProject")}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <label className="panel__filter">
        <Icon name="search" size={13} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filterProjects")}
          aria-label={t("filterProjects")}
        />
      </label>
      <div className="panel__list">
        {visible.map((p) => (
          <NavLink
            key={p.id}
            to={`/projects/${p.id}/board`}
            title={p.name}
            className={({ isActive }) => `panel__item${isActive ? " is-active" : ""}`}
          >
            <span className="panel__dot" />
            <span className="panel__name">{p.name}</span>
          </NavLink>
        ))}
        {visible.length === 0 && (
          <p className="panel__empty">
            {projects.length === 0 ? t("noProjects") : t("noProjectsMatch")}
          </p>
        )}
      </div>
    </aside>
  );
}
