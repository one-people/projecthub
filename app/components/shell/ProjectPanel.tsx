import { useEffect, useState } from "react";
import { Link, NavLink } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { useI18n } from "~/lib/i18n";
import { Icon, type IconName } from "~/components/ui/Icon";
import type { Project } from "~/models/project";

/** 项目空间内的上下文面板：返回全部项目 + 本项目视图导航 */
export function ProjectPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    const sub = liveQuery(() => db.projects.get(projectId)).subscribe((p) =>
      setProject(p ?? null),
    );
    return () => sub.unsubscribe();
  }, [projectId]);

  const views: { to: string; icon: IconName; label: string }[] = [
    { to: `/projects/${projectId}/board`, icon: "kanban", label: t("board") },
    { to: `/projects/${projectId}/list`, icon: "list", label: t("list") },
    { to: `/projects/${projectId}/table`, icon: "table", label: t("tableView") },
    { to: `/projects/${projectId}/calendar`, icon: "calendar", label: t("calendarView") },
    { to: `/projects/${projectId}/timeline`, icon: "timeline", label: t("timelineView") },
    { to: `/projects/${projectId}/stats`, icon: "zap", label: t("statsView") },
    { to: `/projects/${projectId}/settings`, icon: "settings", label: t("settings") },
  ];

  return (
    <aside className="panel" aria-label={t("viewSwitch")}>
      <Link to="/projects" className="panel__back" title={t("allProjects")}>
        <Icon name="chevronLeft" size={14} />
        <span>{t("allProjects")}</span>
      </Link>
      <p className="panel__project-name" title={project?.name}>
        {project?.name ?? t("loading")}
      </p>
      <div className="panel__list">
        {views.map((view) => (
          <NavLink
            key={view.to}
            to={view.to}
            className={({ isActive }) => `panel__item${isActive ? " is-active" : ""}`}
          >
            <Icon name={view.icon} size={15} className="panel__view-icon" />
            <span className="panel__name">{view.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
