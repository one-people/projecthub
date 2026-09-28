import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { userService } from "~/services/user.service";
import { useI18n, t as translate } from "~/lib/i18n";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Icon } from "~/components/ui/Icon";
import type { User } from "~/models/user";
import type { Project } from "~/models/project";

export const handle = { crumb: () => ({ label: translate("usersMenu") }) };

/** 用户管理：本机本地用户的新建 / 删除（身份切换入口在左下角头像） */
export default function UsersRoute() {
  const { t } = useI18n();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [newUserName, setNewUserName] = useState("");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [rows, projectRows, pref] = await Promise.all([
        db.users.toArray(),
        db.projects.toArray(),
        db.preferences.get("currentUserId"),
      ]);
      return { rows, projectRows, meId: pref?.value ?? "" };
    }).subscribe(({ rows, projectRows, meId: current }) => {
      setUsers(rows);
      setProjects(projectRows.filter((p) => !p.deletedAt));
      setMeId(typeof current === "string" ? current : "");
    });
    return () => sub.unsubscribe();
  }, []);

  async function addUser() {
    const name = newUserName.trim();
    if (!name) return;
    try {
      await userService.create(name);
      setNewUserName("");
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteUser() {
    if (!pendingDeleteUser) return;
    try {
      await userService.remove(pendingDeleteUser.id);
      setPendingDeleteUser(null);
      toast.success(t("deleted"));
    } catch (e) {
      setPendingDeleteUser(null);
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("usersMenu")}</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          {t("usersCount", { count: users.length })}
        </span>
        <span className="page-toolbar__spacer" />
        <form
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            void addUser();
          }}
        >
          <input
            className="input"
            style={{ width: 220 }}
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder={t("newUserNamePlaceholder")}
            aria-label={t("newUserNamePlaceholder")}
          />
          <button type="submit" className="btn btn--primary" disabled={!newUserName.trim()}>
            <Icon name="plus" size={15} />{t("addUser")}
          </button>
        </form>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>{t("userManagementHint")}</p>

      <section className="card">
        <ul className="user-list">
          {users.map((u) => {
            const owned = projects.filter((p) => p.ownerId === u.id).length;
            const memberOf = projects.filter(
              (p) => p.ownerId !== u.id && p.memberRoles[u.id],
            ).length;
            const isMe = u.id === meId;
            return (
              <li key={u.id} className="user-row">
                <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 80 }}>
                  {u.name}
                  {isMe && <span className="hint">{t("itsYou")}</span>}
                </span>
                {owned > 0 && <span className="badge badge--role">{t("ownsProjectsCount", { count: owned })}</span>}
                {memberOf > 0 && <span className="badge">{t("memberProjectsCount", { count: memberOf })}</span>}
                <span style={{ flex: 1 }} />
                <button
                  className="btn btn--danger"
                  onClick={() => setPendingDeleteUser(u)}
                  aria-label={t("deleteUserAria", { name: u.name })}
                >
                  <Icon name="trash" size={14} />{t("actionDelete")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title={t("deleteUserAria", { name: pendingDeleteUser?.name ?? "" })}
        message={t("confirmDeleteUser", { name: pendingDeleteUser?.name ?? "" })}
        danger
        onConfirm={() => void deleteUser()}
        onCancel={() => setPendingDeleteUser(null)}
      />
    </div>
  );
}
