import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { notificationService } from "~/services/notification.service";
import { session } from "~/auth/session";
import { db } from "~/repositories/db";
import { formatRelative } from "~/lib/date";
import type { Notification } from "~/models/notification";
import { Icon } from "~/components/ui/Icon";
import { useI18n, t as translate } from "~/lib/i18n";
import type { Dict } from "~/locales/zh-CN";

export const handle = { crumb: () => ({ label: translate("notifications") }) };

const TYPE_LABEL_KEY: Record<Notification["type"], keyof Dict> = {
  mention: "notifMention",
  assign: "notifAssign",
  comment: "notifComment",
  status_change: "notifStatusChange",
};

export default function NotificationsRoute() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [userName, setUserName] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; avatarColor: string }[]>([]);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const me = await session.currentUser();
      const [list, allUsers] = await Promise.all([
        notificationService.list(me.id),
        db.users.toArray(),
      ]);
      return { list, me, allUsers };
    }).subscribe(({ list, me, allUsers }) => {
      setItems(list);
      setUserName(me.name);
      setUsers(allUsers.map((u) => ({ id: u.id, name: u.name, avatarColor: u.avatarColor })));
    });
    return () => sub.unsubscribe();
  }, []);

  async function markAllRead() {
    const me = await session.currentUser();
    await notificationService.markAllRead(me.id);
  }

  const avatar = (id: string) =>
    users.find((u) => u.id === id)?.avatarColor ?? "#94A3B8";

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>
          {t("notifications")}
          <span className="hint" style={{ marginLeft: 10 }}>{userName}</span>
        </h1>
        <span className="page-toolbar__spacer" />
        {items.some((n) => !n.read) && (
          <button className="btn" onClick={() => void markAllRead()}>
            <Icon name="check" size={15} />
            {t("markAllRead")}
          </button>
        )}
      </div>

      <div className="card">
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((n) => {
            const actor = users.find((u) => u.id === n.payload.actorId)?.name ?? t("someone");
            return (
              <li key={n.id} className={`notif-item${n.read ? " is-read" : ""}`}>
                {!n.read && <span className="notif-dot" aria-label={t("unreadAria")} />}
                <span className="avatar" style={{ background: avatar(n.payload.actorId) }} aria-hidden>
                  {actor.slice(0, 1)}
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{actor}</strong> {t(TYPE_LABEL_KEY[n.type])}
                  {n.payload.taskTitle && (
                    <span className="data-muted">「{n.payload.taskTitle}」</span>
                  )}
                  {n.payload.count > 1 && (
                    <span className="badge badge--accent" style={{ marginLeft: 8 }}>
                      {t("notifTimes", { count: n.payload.count })}
                    </span>
                  )}
                </span>
                <span className="comment-meta">{formatRelative(n.updatedAt, locale)}</span>
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
    </div>
  );
}
