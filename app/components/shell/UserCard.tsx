import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import type { User } from "~/models/user";

/** Rail 底部头像：点击弹出身份切换菜单（向右展开） */
export function UserCard() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      setMe(await session.currentUser());
    })();
    // liveQuery：设置页新建/删除用户后，身份菜单即时刷新
    const sub = liveQuery(() => db.users.toArray()).subscribe(setUsers);
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!me) return null;

  return (
    <div className="user-card" ref={ref}>
      <button
        className={`user-card__trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${t("currentUser")}：${me.name}`}
        title={me.name}
      >
        <span className="avatar" style={{ background: me.avatarColor }}>{me.name.slice(0, 1)}</span>
      </button>
      {open && (
        <div className="user-card__menu" role="menu" aria-label={t("currentUser")}>
          <p className="field-label" style={{ padding: "4px 8px" }}>{t("currentUser")}</p>
          {users.map((u) => (
            <button
              key={u.id}
              className="user-card__item"
              role="menuitem"
              onClick={async () => {
                await session.switchUser(u.id);
                setOpen(false);
                navigate(".");
              }}
            >
              <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
              {u.name}
              {u.id === me.id && <Icon name="check" size={14} />}
            </button>
          ))}
          <button
            className="user-card__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
          >
            <Icon name="settings" size={14} />
            {t("settings")}
          </button>
        </div>
      )}
    </div>
  );
}
