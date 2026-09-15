import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import type { User } from "~/models/user";

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
      setUsers(await db.users.toArray());
    })();
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
      <button className="user-card__trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="avatar" style={{ background: me.avatarColor }}>{me.name.slice(0, 1)}</span>
        {!open && <span className="user-card__name">{me.name}</span>}
        <Icon name="chevronRight" size={14} />
      </button>
      {open && (
        <div className="user-card__menu" role="menu">
          <p className="field-label">{t("currentUser")}</p>
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
            onClick={() => navigate("/settings")}
          >
            <Icon name="settings" size={14} />
            {t("settings")}
          </button>
        </div>
      )}
    </div>
  );
}
