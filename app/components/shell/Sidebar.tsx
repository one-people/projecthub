import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon, type IconName } from "~/components/ui/Icon";
import { UserCard } from "./UserCard";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await session.currentUser();
      const ps = await db.projects.toArray();
      setIsAdmin(ps.some((p) => p.memberRoles[me.id] === "admin"));
    })();
    const sub = liveQuery(async () => {
      const me = await session.currentUser();
      const rows = await db.notifications.where("userId").equals(me.id).toArray();
      return rows.filter((n) => !n.read).length;
    }).subscribe(setUnread);
    return () => sub.unsubscribe();
  }, []);

  const item = (to: string, icon: IconName, label: string, badge?: number) => (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar__item${isActive ? " is-active" : ""}`}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} size={17} />
      {!collapsed && <span>{label}</span>}
      {badge !== undefined && badge > 0 && <span className="sidebar__badge">{badge}</span>}
    </NavLink>
  );

  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar__top">
        <button className="sidebar__brand" onClick={() => navigate("/")}>
          <span className="brand__mark"><Icon name="brand" size={16} /></span>
          {!collapsed && <span>ProjectHub</span>}
        </button>
        <button className="sidebar__search" disabled title="全局搜索（阶段三开放）">
          <Icon name="search" size={15} />
          {!collapsed && <span className="hint">{t("searchPlaceholder")}</span>}
        </button>
        <nav className="sidebar__nav" aria-label="主导航">
          {item("/", "home", t("workbench"))}
          {item("/projects", "kanban", t("projects"))}
          {item("/notifications", "bell", t("notifications"), unread)}
          {item("/trash", "trash", t("trash"))}
        </nav>
        {isAdmin && !collapsed && (
          <div className="sidebar__group">
            <p className="field-label">{t("adminGroup")}</p>
            {item("/admin/users", "user", t("userManage"))}
            {item("/admin/audit", "list", t("auditLog"))}
          </div>
        )}
      </div>
      <div className="sidebar__bottom">
        <UserCard />
        <button className="icon-btn" onClick={onToggle} aria-label="折叠侧边栏">
          <Icon name="panel" size={16} />
        </button>
      </div>
    </aside>
  );
}
