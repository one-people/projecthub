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

/** 用户管理：左列用户清单（筛选/批量删除），右列新建用户（身份切换入口在左下角头像） */
export default function UsersRoute() {
  const { t } = useI18n();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [newUserName, setNewUserName] = useState("");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

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

  function openEdit(u: User) {
    setEditing(u);
    setEditName(u.name);
    setEditEmail(u.email);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await userService.update(editing.id, { name: editName, email: editEmail });
      setEditing(null);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteUser() {
    if (!pendingDeleteUser) return;
    try {
      await userService.remove(pendingDeleteUser.id);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
    setPendingDeleteUser(null);
  }

  async function batchDelete() {
    let done = 0;
    let failed = 0;
    for (const id of selected) {
      try {
        await userService.remove(id);
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setSelected(new Set());
    setConfirmBatch(false);
    if (failed > 0) toast.success(t("batchDeleteResult", { done, failed }));
    else toast.success(t("batchDeleteAllDone", { count: done }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const keyword = filter.trim().toLowerCase();
  const visible = keyword
    ? users.filter((u) => u.name.toLowerCase().includes(keyword))
    : users;
  const allSelected = visible.length > 0 && visible.every((u) => selected.has(u.id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map((u) => u.id)));
  }

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("usersMenu")}</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          {t("usersCount", { count: users.length })}
        </span>
        <span className="page-toolbar__spacer" />
        {selected.size > 0 && (
          <button className="btn btn--danger" onClick={() => setConfirmBatch(true)}>
            <Icon name="trash" size={15} />{t("batchDeleteUsers")} ({selected.size})
          </button>
        )}
      </div>

      <div className="users-layout">
        <section className="card">
          <div className="users-list-head">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label={t("selectAllUsers")}
            />
            <span className="hint">
              {selected.size > 0
                ? t("selectedCount", { count: selected.size })
                : t("allUsers", { count: visible.length })}
            </span>
            <span style={{ flex: 1 }} />
            <div style={{ position: "relative" }}>
              <Icon name="search" size={14} className="users-filter__icon" />
              <input
                className="input users-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("searchUsers")}
                aria-label={t("searchUsers")}
              />
            </div>
          </div>
          <ul className="user-list">
            {visible.map((u) => {
              const owned = projects.filter((p) => p.ownerId === u.id).length;
              const memberOf = projects.filter(
                (p) => p.ownerId !== u.id && p.memberRoles[u.id],
              ).length;
              const isMe = u.id === meId;
              return (
                <li key={u.id} className="user-row">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    aria-label={t("selectUserAria", { name: u.name })}
                  />
                  <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, minWidth: 72 }}>
                    {u.name}
                    {isMe && <span className="hint">{t("itsYou")}</span>}
                  </span>
                  {u.email && <span className="hint">{u.email}</span>}
                  {owned > 0 && <span className="badge badge--role">{t("ownsProjectsCount", { count: owned })}</span>}
                  {memberOf > 0 && <span className="badge">{t("memberProjectsCount", { count: memberOf })}</span>}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("editUserAria", { name: u.name })}
                    title={t("editUser")}
                    onClick={() => openEdit(u)}
                  >
                    <Icon name="pencil" size={14} />
                  </button>
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
          {visible.length === 0 && (
            <p className="empty" style={{ marginBottom: 0 }}>{t("noMatchUsers")}</p>
          )}
        </section>

        <section className="card">
          <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="user" size={16} />
            {t("addUser")}
          </h2>
          <form
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void addUser();
            }}
          >
            <input
              className="input"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addUser();
                }
              }}
              placeholder={t("newUserNamePlaceholder")}
              aria-label={t("newUserNamePlaceholder")}
            />
            <button type="submit" className="btn btn--primary" disabled={!newUserName.trim()}>
              <Icon name="plus" size={15} />{t("addUser")}
            </button>
          </form>
          <p className="hint">{t("userManagementHint")}</p>
        </section>
      </div>

      {editing && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("editUser")}
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <div className="modal__header">
              <h2 style={{ fontSize: 16, margin: 0 }}>{t("editUser")}</h2>
              <button type="button" className="icon-btn" aria-label={t("close")} onClick={() => setEditing(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <label className="field-label" style={{ display: "block", marginTop: 14 }}>
              {t("userNameLabel")}
              <input
                className="input"
                style={{ width: "100%", marginTop: 4 }}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("userNameLabel")}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void saveEdit(); }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            </label>
            <label className="field-label" style={{ display: "block", marginTop: 10 }}>
              {t("userEmailLabel")}
              <input
                className="input"
                type="email"
                style={{ width: "100%", marginTop: 4 }}
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder={t("userEmailPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void saveEdit(); }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            </label>
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>{t("cancel")}</button>
              <button type="submit" className="btn btn--primary" disabled={!editName.trim()}>
                {t("save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title={t("deleteUserAria", { name: pendingDeleteUser?.name ?? "" })}
        message={t("confirmDeleteUser", { name: pendingDeleteUser?.name ?? "" })}
        danger
        onConfirm={() => void deleteUser()}
        onCancel={() => setPendingDeleteUser(null)}
      />
      <ConfirmDialog
        open={confirmBatch}
        title={t("batchDeleteUsers")}
        message={t("confirmBatchDeleteUsers", { count: selected.size })}
        danger
        onConfirm={() => void batchDelete()}
        onCancel={() => setConfirmBatch(false)}
      />
    </div>
  );
}
