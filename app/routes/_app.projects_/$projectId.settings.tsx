import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { can, type RoleId } from "~/auth/rbac";
import { trashService } from "~/services/trash.service";
import { auditService } from "~/services/audit.service";
import { uuid } from "~/lib/id";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { Project } from "~/models/project";
import type { User } from "~/models/user";

export const handle = { crumb: () => ({ label: translate("projectSettings") }) };

type Tab = "basic" | "members" | "columns" | "danger";
const ROLE_OPTIONS: RoleId[] = ["admin", "projectAdmin", "member", "guest"];

const ROLE_LABELS: Record<RoleId, string> = {
  admin: "管理员",
  projectAdmin: "项目管理员",
  member: "成员",
  guest: "只读访客",
};

export default function ProjectSettingsRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const projectId = window.location.pathname.split("/")[2] ?? "";
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState<RoleId>("member");
  const [actorId, setActorId] = useState("");
  const [tab, setTab] = useState<Tab>("basic");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [desc, setDesc] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");

  useEffect(() => {
    const sub = liveQuery(async () => {
      const p = await db.projects.get(projectId);
      const [us, me] = await Promise.all([db.users.toArray(), session.currentUser()]);
      return { p, us, me, role: (p?.memberRoles[me.id] as RoleId | undefined) ?? "member" };
    }).subscribe(({ p, us, me, role }) => {
      setProject(p ?? null);
      setUsers(us);
      setRole(role);
      setActorId(me.id);
      if (p) {
        setName((prev) => (prev ? prev : p.name));
        setDesc((prev) => (prev ? prev : p.description));
      }
    });
    return () => sub.unsubscribe();
  }, [projectId]);

  if (!project) {
    return (
      <div className="empty">
        <Icon name="settings" size={32} />
        <p style={{ margin: 0 }}>{t("loading")}</p>
      </div>
    );
  }

  const canManage = can(role, "project:update");
  const current = project;

  async function saveBasic() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("errNameRequired"));
      return;
    }
    setNameError("");
    await db.projects.update(current.id, { name: trimmed, description: desc.trim(), updatedAt: new Date().toISOString() });
    await auditService.log(actorId, "update", "project", current.id, `更新了项目「${trimmed}」的基本信息`);
    toast.success(t("saved"));
  }

  async function changeMemberRole(userId: string, nextRole: RoleId) {
    const memberRoles = { ...current.memberRoles, [userId]: nextRole };
    await db.projects.update(current.id, { memberRoles, updatedAt: new Date().toISOString() });
    await auditService.log(actorId, "update", "project", current.id, `调整了成员角色（${ROLE_LABELS[nextRole]}）`);
    toast.success(t("saved"));
  }

  async function removeMember(userId: string) {
    const memberRoles = { ...current.memberRoles };
    delete memberRoles[userId];
    await db.projects.update(current.id, { memberRoles, updatedAt: new Date().toISOString() });
    await auditService.log(actorId, "update", "project", current.id, "移除了项目成员");
    toast.success(t("saved"));
    setPendingRemove(null);
  }

  async function addMember(userId: string) {
    const memberRoles = { ...current.memberRoles, [userId]: "member" };
    await db.projects.update(current.id, { memberRoles, updatedAt: new Date().toISOString() });
    await auditService.log(actorId, "update", "project", current.id, "添加了项目成员");
    toast.success(t("saved"));
  }

  async function addColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const order = Math.max(...current.statusColumns.map((c) => c.order), -1) + 1;
    const statusColumns = [...current.statusColumns, { id: uuid(), name: trimmed, isDone: false, order }];
    await db.projects.update(current.id, { statusColumns, updatedAt: new Date().toISOString() });
    setNewColumnName("");
    toast.success(t("saved"));
  }

  async function updateColumn(colId: string, patch: Partial<{ name: string; isDone: boolean }>) {
    const statusColumns = current.statusColumns.map((c) => (c.id === colId ? { ...c, ...patch } : c));
    await db.projects.update(current.id, { statusColumns, updatedAt: new Date().toISOString() });
  }

  async function deleteColumn(colId: string) {
    const statusColumns = current.statusColumns.filter((c) => c.id !== colId);
    await db.projects.update(current.id, { statusColumns, updatedAt: new Date().toISOString() });
    await auditService.log(actorId, "update", "project", current.id, "删除了状态列");
    toast.success(t("saved"));
  }

  async function moveColumn(index: number, delta: -1 | 1) {
    const target = index + delta;
    const cols = [...current.statusColumns].sort((a, b) => a.order - b.order);
    if (target < 0 || target >= cols.length) return;
    [cols[index], cols[target]] = [cols[target]!, cols[index]!];
    const statusColumns = cols.map((c, i) => ({ ...c, order: i }));
    await db.projects.update(current.id, { statusColumns, updatedAt: new Date().toISOString() });
  }

  async function deleteProject() {
    if (confirmText !== current.name) return;
    await trashService.deleteProject(actorId, role, current.id);
    toast.success(t("deleted"), {
      undo: async () => {
        await trashService.restoreProject(actorId, "admin", current.id);
      },
    });
    navigate("/projects");
  }

  const sortedColumns = [...project.statusColumns].sort((a, b) => a.order - b.order);
  const nonMembers = users.filter((u) => !project.memberRoles[u.id]);
  const members = users.filter((u) => project.memberRoles[u.id]);

  return (
    <div>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{project.name}</h1>
        <span className="badge badge--role">{ROLE_LABELS[role]}</span>
        <span className="page-toolbar__spacer" />
        <nav className="segmented" aria-label={t("projectSettings")}>
          <button className="segmented__item" onClick={() => navigate(`/projects/${project.id}/board`)}>
            <Icon name="kanban" size={15} />{t("board")}
          </button>
          <span className="segmented__item segmented__item--active">
            <Icon name="settings" size={15} />{t("settings")}
          </span>
        </nav>
      </div>

      <nav className="segmented" aria-label={t("projectSettings")} style={{ marginTop: 16 }}>
        {(["basic", "members", "columns", "danger"] as Tab[]).map((k) => (
          <button
            key={k}
            className={`segmented__item${tab === k ? " segmented__item--active" : ""}`}
            onClick={() => setTab(k)}
          >
            {t(k === "basic" ? "tabBasic" : k === "members" ? "tabMembers" : k === "columns" ? "tabColumns" : "tabDanger")}
          </button>
        ))}
      </nav>

      {tab === "basic" && (
        <section className="card" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="field-label">
            {t("projectNameLabel")}
            <input
              className="input"
              value={name}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => (name.trim() ? setNameError("") : setNameError(t("errNameRequired")))}
              aria-invalid={Boolean(nameError)}
            />
            {nameError && <span className="field-error" role="alert">{nameError}</span>}
          </label>
          <label className="field-label">
            {t("projectDescLabel")}
            <textarea className="input" rows={3} value={desc} disabled={!canManage} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <div>
            <button className="btn btn--primary" disabled={!canManage} onClick={() => void saveBasic()}>
              <Icon name="check" size={15} />{t("save")}
            </button>
          </div>
        </section>
      )}

      {tab === "members" && (
        <section className="card" style={{ marginTop: 16 }}>
          <ul className="user-list">
            {members.map((u) => (
              <li key={u.id} className="user-row">
                <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
                <strong style={{ flex: 1 }}>{u.name}</strong>
                <select
                  className="input"
                  value={project.memberRoles[u.id] as RoleId}
                  disabled={!canManage}
                  onChange={(e) => void changeMemberRole(u.id, e.target.value as RoleId)}
                  aria-label={`${u.name} ${t("myRole")}`}
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button className="btn btn--danger" disabled={!canManage} onClick={() => setPendingRemove(u.id)}>
                  <Icon name="close" size={14} />{t("removeMember")}
                </button>
              </li>
            ))}
          </ul>
          {canManage && nonMembers.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
              <span className="field-label" style={{ margin: 0 }}>{t("addMember")}</span>
              <select className="input" value="" onChange={(e) => e.target.value && void addMember(e.target.value)} aria-label={t("addMember")}>
                <option value="">—</option>
                {nonMembers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </section>
      )}

      {tab === "columns" && (
        <section className="card" style={{ marginTop: 16 }}>
          <ul className="user-list">
            {sortedColumns.map((c, i) => (
              <li key={c.id} className="user-row">
                <input
                  className="input"
                  style={{ maxWidth: 180 }}
                  defaultValue={c.name}
                  disabled={!canManage}
                  onBlur={(e) => e.target.value.trim() && void updateColumn(c.id, { name: e.target.value.trim() })}
                  aria-label={t("columnName")}
                />
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={c.isDone}
                    disabled={!canManage}
                    onChange={(e) => void updateColumn(c.id, { isDone: e.target.checked })}
                  />
                  {t("columnDone")}
                </label>
                <span style={{ flex: 1 }} />
                <button className="icon-btn" disabled={!canManage || i === 0} onClick={() => void moveColumn(i, -1)} aria-label={t("moveUp")}>
                  <Icon name="back" size={14} className="icon-rotate--up" />
                </button>
                <button className="icon-btn" disabled={!canManage || i === sortedColumns.length - 1} onClick={() => void moveColumn(i, 1)} aria-label={t("moveDown")}>
                  <Icon name="back" size={14} className="icon-rotate--down" />
                </button>
                <button className="btn btn--danger" disabled={!canManage || sortedColumns.length <= 1} onClick={() => void deleteColumn(c.id)}>
                  <Icon name="trash" size={14} />{t("deleteColumn")}
                </button>
              </li>
            ))}
          </ul>
          {canManage && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                className="input"
                style={{ maxWidth: 220 }}
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder={t("columnName")}
                aria-label={t("addColumn")}
              />
              <button className="btn" onClick={() => void addColumn()}>
                <Icon name="plus" size={15} />{t("addColumn")}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "danger" && (
        <section className="danger-zone card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ color: "var(--color-danger)" }}>{t("dangerZone")}</h2>
          <p className="hint">{t("deleteProjectHint")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
            <label className="field-label">
              {t("typeToConfirm")}
              <input
                className="input"
                value={confirmText}
                disabled={!canManage}
                onChange={(e) => setConfirmText(e.target.value)}
                aria-label={t("typeToConfirm")}
              />
            </label>
            <button
              className="btn btn--danger"
              disabled={!canManage || confirmText !== project.name}
              onClick={() => void deleteProject()}
            >
              <Icon name="trash" size={15} />{t("deleteProject")}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={t("removeMember")}
        message={t("confirmRemoveMember")}
        danger
        onConfirm={() => pendingRemove && void removeMember(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
