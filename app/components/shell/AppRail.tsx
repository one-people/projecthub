import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon, type IconName } from "~/components/ui/Icon";
import { UserCard } from "./UserCard";

interface RailItem {
  to: string;
  icon: IconName;
  label: string;
  badge?: number;
}

/** 左侧应用图标栏（Worktile 式导航 Rail，深色恒定） */
export function AppRail({ onSearch }: { onSearch: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const me = await session.currentUser();
      const [notifs, projects] = await Promise.all([
        db.notifications.where("userId").equals(me.id).toArray(),
        db.projects.toArray(),
      ]);
      return {
        unread: notifs.filter((n) => !n.read).length,
        isAdmin: projects.some((p) => !p.deletedAt && p.memberRoles[me.id] === "admin"),
      };
    }).subscribe(({ unread, isAdmin }) => {
      setUnread(unread);
      setIsAdmin(isAdmin);
    });
    return () => sub.unsubscribe();
  }, []);

  const item = ({ to, icon, label, badge }: RailItem) => (
    <NavLink
      to={to}
      className={({ isActive }) => `rail__item${isActive ? " is-active" : ""}`}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={19} />
      {badge !== undefined && badge > 0 && (
        <span className="rail__badge">{badge > 99 ? "99+" : badge}</span>
      )}
    </NavLink>
  );

  return (
    <nav className="rail" aria-label={t("workspaceGroup")}>
      <button className="rail__brand" onClick={() => navigate("/")} aria-label="ProjectHub">
        <Icon name="brand" size={18} />
      </button>
      {item({ to: "/", icon: "home", label: t("workbench") })}
      {item({ to: "/projects", icon: "kanban", label: t("projects") })}
      {item({ to: "/notifications", icon: "bell", label: t("notifications"), badge: unread })}
      {item({ to: "/trash", icon: "trash", label: t("trash") })}
      {isAdmin && (
        <>
          <span className="rail__divider" />
          {item({ to: "/admin/users", icon: "user", label: t("userManage") })}
          {item({ to: "/admin/audit", icon: "list", label: t("auditLog") })}
        </>
      )}
      <span className="rail__spacer" />
      <button
        className="rail__item"
        onClick={onSearch}
        title={`${t("globalSearch")} (/)`}
        aria-label={t("globalSearch")}
      >
        <Icon name="search" size={19} />
      </button>
      <NavLink
        to="/settings"
        className={({ isActive }) => `rail__item${isActive ? " is-active" : ""}`}
        title={t("settings")}
        aria-label={t("settings")}
      >
        <Icon name="settings" size={19} />
      </NavLink>
      <UserCard />
    </nav>
  );
}
