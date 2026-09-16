import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon, type IconName } from "~/components/ui/Icon";
import { UserCard } from "./UserCard";

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  badge?: number;
}

export function Sidebar({ collapsed, onToggle, onSearch }: { collapsed: boolean; onToggle: () => void; onSearch: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    void (async () => {
      const me = await session.currentUser();
      const ps = await db.projects.toArray();
      setIsAdmin(ps.some((p) => p.memberRoles[me.id] === "admin"));
    })();
    const sub = liveQuery(async () => {
      const me = await session.currentUser();
      const [rows, ps] = await Promise.all([
        db.notifications.where("userId").equals(me.id).toArray(),
        db.projects.toArray(),
      ]);
      return {
        unread: rows.filter((n) => !n.read).length,
        projects: ps
          .filter((p) => !p.deletedAt && p.memberRoles[me.id])
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
          .reverse()
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: p.name })),
      };
    }).subscribe(({ unread, projects }) => {
      setUnread(unread);
      setProjects(projects);
    });
    return () => sub.unsubscribe();
  }, []);

  const item = ({ to, icon, label, badge }: NavItem) => (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar__item${isActive ? " is-active" : ""}`}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} size={16} />
      {!collapsed && <span>{label}</span>}
      {badge !== undefined && badge > 0 && <span className="sidebar__badge">{badge}</span>}
    </NavLink>
  );

  const group = (label: string, children: React.ReactNode) => (
    <div className="sidebar__group">
      {!collapsed && <p className="sidebar__group-label">{label}</p>}
      {children}
    </div>
  );

  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar__header">
        <button className="sidebar__brand" onClick={() => navigate("/")}>
          <span className="brand__mark"><Icon name="brand" size={16} /></span>
          {!collapsed && <span>ProjectHub</span>}
        </button>
        <button className="icon-btn" onClick={onToggle} aria-label={collapsed ? t("expand") : t("collapse")}>
          <Icon name="panel" size={16} />
        </button>
      </div>
      <div className="sidebar__top">
        <button className="sidebar__search" onClick={onSearch} title={`${t("globalSearch")} (/)`}>
          <Icon name="search" size={15} />
          {!collapsed && <span className="hint">{t("searchPlaceholder")}</span>}
        </button>

        {group(t("workspaceGroup"), (
          <>
            {item({ to: "/", icon: "home", label: t("workbench") })}
            {item({ to: "/projects", icon: "kanban", label: t("projects") })}
          </>
        ))}

        {!collapsed && projects.length > 0 && group(t("myProjects"), (
          <ul className="sidebar__projects">
            {projects.map((p) => (
              <li key={p.id}>
                <NavLink
                  to={`/projects/${p.id}/board`}
                  className={({ isActive }) => `sidebar__item${isActive ? " is-active" : ""}`}
                  title={p.name}
                >
                  <span className="sidebar__project-dot" />
                  <span className="sidebar__project-name">{p.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        ))}

        {group(t("personalGroup"), (
          <>
            {item({ to: "/notifications", icon: "bell", label: t("notifications"), badge: unread })}
            {item({ to: "/trash", icon: "trash", label: t("trash") })}
          </>
        ))}

        {isAdmin && group(t("adminGroup"), (
          <>
            {item({ to: "/admin/users", icon: "user", label: t("userManage") })}
            {item({ to: "/admin/audit", icon: "list", label: t("auditLog") })}
          </>
        ))}
      </div>
      <div className="sidebar__bottom">
        <UserCard />
      </div>
    </aside>
  );
}
