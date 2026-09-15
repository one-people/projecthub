import { useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import { notificationService } from "~/services/notification.service";
import { session } from "~/auth/session";
import { db } from "~/repositories/db";
import { formatRelative } from "~/lib/date";
import type { Notification } from "~/models/notification";
import { Icon } from "~/components/ui/Icon";
import { useI18n } from "~/lib/i18n";

const TYPE_LABELS: Record<Notification["type"], string> = {
  mention: "提及了你",
  assign: "指派给你",
  comment: "评论了任务",
  status_change: "变更了任务状态",
};

export default function NotificationsRoute() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [userName, setUserName] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; avatarColor: string }[]>([]);

  useEffect(() => {
    void (async () => {
      const me = await session.currentUser();
      const [list, allUsers] = await Promise.all([
        notificationService.list(me.id),
        db.users.toArray(),
      ]);
      setItems(list);
      setUserName(me.name);
      setUsers(allUsers.map((u) => ({ id: u.id, name: u.name, avatarColor: u.avatarColor })));
    })();
  }, []);

  async function markAllRead() {
    const me = await session.currentUser();
    await notificationService.markAllRead(me.id);
    setItems(await notificationService.list(me.id));
  }

  const avatar = (id: string) =>
    users.find((u) => u.id === id)?.avatarColor ?? "#94A3B8";

  return (
    <main className="page">
      <div className="page-toolbar">
        <button className="app-header__back" onClick={() => navigate("/")} aria-label="返回首页">
          <Icon name="back" size={18} />
        </button>
        <h1 style={{ fontSize: 18 }}>
          {t("notifications")}
          <span className="hint" style={{ marginLeft: 10 }}>{userName}</span>
        </h1>
        <span className="page-toolbar__spacer" />
        {items.some((n) => !n.read) && (
          <button className="btn" onClick={markAllRead}>
            <Icon name="check" size={15} />
            {t("markAllRead")}
          </button>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((n) => {
            const actor = users.find((u) => u.id === n.payload.actorId)?.name ?? "有人";
            return (
              <li key={n.id} className={`notif-item${n.read ? " is-read" : ""}`}>
                {!n.read && <span className="notif-dot" aria-label="未读" />}
                <span className="avatar" style={{ background: avatar(n.payload.actorId) }} aria-hidden>
                  {actor.slice(0, 1)}
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{actor}</strong> {TYPE_LABELS[n.type]}
                  {n.payload.taskTitle && (
                    <span className="data-muted">「{n.payload.taskTitle}」</span>
                  )}
                  {n.payload.count > 1 && (
                    <span className="badge badge--accent" style={{ marginLeft: 8 }}>
                      {n.payload.count} 次
                    </span>
                  )}
                </span>
                <span className="comment-meta">{formatRelative(n.updatedAt)}</span>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="empty">
              <Icon name="bell" size={32} />
              <p style={{ margin: 0 }}>{t("noNotifications")}</p>
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
