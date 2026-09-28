import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { can, type RoleId } from "~/auth/rbac";
import { useI18n, t as translate } from "~/lib/i18n";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";
import { Icon, type IconName } from "~/components/ui/Icon";
import type { Project } from "~/models/project";
import type { User } from "~/models/user";

export const handle = { crumb: () => ({ label: translate("projects"), to: "/projects" }) };

export interface ProjectOutletContext {
  project: Project;
  role: RoleId;
  actorId: string;
  users: User[];
}

/** 项目空间共享外壳：项目名 + 成员头像组 + 视图 Tab（Worktile 式） */
export default function ProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [state, setState] = useState<ProjectOutletContext | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const sub = liveQuery(async () => {
      const p = await db.projects.get(projectId);
      const [me, users] = await Promise.all([session.currentUser(), db.users.toArray()]);
      const role = (p?.memberRoles[me.id] as RoleId | undefined) ?? "member";
      return { p, me, users, role };
    }).subscribe(({ p, me, users, role }) => {
      if (!p || p.deletedAt) {
        setMissing(true);
        return;
      }
      setMissing(false);
      setState({ project: p, role, actorId: me.id, users });
    });
    return () => sub.unsubscribe();
  }, [projectId]);

  useEffect(() => {
    if (missing) navigate("/projects", { replace: true });
  }, [missing, navigate]);

  if (!state) {
    return (
      <div className="project-layout">
        <p className="empty">{t("loading")}</p>
      </div>
    );
  }

  const { project, role, actorId, users } = state;
  if (!can(role, "task:read")) {
    return (
      <div className="project-layout">
        <div className="empty" style={{ padding: 80 }}>
          <Icon name="user" size={32} />
          <p style={{ margin: 0 }}>{t("forbidden")}</p>
        </div>
      </div>
    );
  }

  const members = Object.keys(project.memberRoles)
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u));
  const stacked = members.slice(0, 5);
  const more = members.length - stacked.length;

  const tabs: { to: string; icon: IconName; label: string }[] = [
    { to: `/projects/${project.id}/board`, icon: "kanban", label: t("board") },
    { to: `/projects/${project.id}/list`, icon: "list", label: t("list") },
    { to: `/projects/${project.id}/table`, icon: "table", label: t("tableView") },
    { to: `/projects/${project.id}/calendar`, icon: "calendar", label: t("calendarView") },
    { to: `/projects/${project.id}/timeline`, icon: "timeline", label: t("timelineView") },
    { to: `/projects/${project.id}/settings`, icon: "settings", label: t("settings") },
  ];

  return (
    <div className="project-layout">
      <header className="project-head">
        <div className="project-head__row">
          <h1 className="project-head__name">{project.name}</h1>
          <span
            className="avatar-stack"
            title={members.map((m) => m.name).join("、")}
            aria-label={`${t("members")}：${members.map((m) => m.name).join("、")}`}
          >
            {stacked.map((u) => (
              <span key={u.id} className="avatar" style={{ background: u.avatarColor }} title={u.name}>
                {u.name.slice(0, 1)}
              </span>
            ))}
            {more > 0 && <span className="avatar-stack__more">+{more}</span>}
          </span>
          <span className="badge badge--role">{t(ROLE_LABEL_KEY[role])}</span>
        </div>
        <nav className="tabs project-head__tabs" aria-label={t("viewSwitch")}>
          {tabs.map((tab) => {
            const active =
              location.pathname === `/projects/${project.id}` || location.pathname.startsWith(`${tab.to}/`) || location.pathname === tab.to;
            return (
              <Link key={tab.to} to={tab.to} className={`tabs__item${active ? " is-active" : ""}`}>
                <Icon name={tab.icon} size={15} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="project-layout__body">
        <Outlet context={{ project, role, actorId, users }} />
      </div>
    </div>
  );
}
