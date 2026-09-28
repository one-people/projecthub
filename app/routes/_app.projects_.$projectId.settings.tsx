import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { can, type RoleId } from "~/auth/rbac";
import { trashService } from "~/services/trash.service";
import { labelService } from "~/services/label.service";
import { milestoneService } from "~/services/milestone.service";
import { taskTemplateService } from "~/services/taskTemplate.service";
import { projectTemplateService } from "~/services/projectTemplate.service";
import { LABEL_COLORS, type Label } from "~/models/label";
import type { Milestone } from "~/models/milestone";
import type { TaskTemplate } from "~/models/taskTemplate";
import { uuid } from "~/lib/id";
import { useI18n, t as translate } from "~/lib/i18n";
import type { Dict } from "~/locales/zh-CN";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";
import { Icon } from "~/components/ui/Icon";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("projectSettings") }) };

type Tab = "basic" | "members" | "columns" | "labels" | "milestones" | "templates" | "danger";
const ROLE_OPTIONS: RoleId[] = ["admin", "projectAdmin", "member", "guest"];

const TAB_KEY: Record<Tab, keyof Dict> = {
  basic: "tabBasic",
  members: "tabMembers",
  columns: "tabColumns",
  labels: "tabLabels",
  milestones: "tabMilestones",
  templates: "tabTemplates",
  danger: "tabDanger",
};

export default function ProjectSettingsRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const { project, role, actorId, users } = useOutletContext<ProjectOutletContext>();
  const [tab, setTab] = useState<Tab>("basic");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [desc, setDesc] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [labels, setLabels] = useState<Label[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<Label | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [msTitle, setMsTitle] = useState("");
  const [msDate, setMsDate] = useState("");
  const [pendingDeleteMilestone, setPendingDeleteMilestone] = useState<Milestone | null>(null);
  const [taskTpls, setTaskTpls] = useState<TaskTemplate[]>([]);
  const [ptName, setPtName] = useState("");
  const [pendingDeleteTaskTpl, setPendingDeleteTaskTpl] = useState<TaskTemplate | null>(null);

  useEffect(() => {
    setName((prev) => (prev ? prev : project.name));
    setDesc((prev) => (prev ? prev : project.description));
  }, [project.id, project.name, project.description]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.labels.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setLabels(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.milestones.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => {
      rows.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date < b.date ? -1 : 1));
      setMilestones(rows);
    });
    return () => sub.unsubscribe();
  }, [project.id]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.taskTemplates.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => {
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setTaskTpls(rows);
    });
    return () => sub.unsubscribe();
  }, [project.id]);

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
    toast.success(t("saved"));
  }

  async function changeMemberRole(userId: string, nextRole: RoleId) {
    const memberRoles = { ...current.memberRoles, [userId]: nextRole };
    await db.projects.update(current.id, { memberRoles, updatedAt: new Date().toISOString() });
    toast.success(t("saved"));
  }

  async function removeMember(userId: string) {
    const memberRoles = { ...current.memberRoles };
    delete memberRoles[userId];
    await db.projects.update(current.id, { memberRoles, updatedAt: new Date().toISOString() });
    toast.success(t("saved"));
    setPendingRemove(null);
  }

  async function addMember(userId: string) {
    const memberRoles = { ...current.memberRoles, [userId]: "member" };
    await db.projects.update(current.id, { memberRoles, updatedAt: new Date().toISOString() });
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

  async function addLabel() {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    try {
      await labelService.create(project.id, trimmed);
      setNewLabelName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function renameLabel(label: Label, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === label.name) return;
    try {
      await labelService.update(label.id, { name: trimmed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteLabel(label: Label) {
    setPendingDeleteLabel(null);
    await labelService.remove(label.id);
    toast.success(t("deleted"));
  }

  async function addMilestone() {
    if (!msTitle.trim() || !msDate) return;
    try {
      await milestoneService.create(project.id, msTitle, `${msDate}T00:00:00`);
      setMsTitle("");
      setMsDate("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function renameMilestone(ms: Milestone, title: string) {
    const trimmed = title.trim();
    if (!trimmed || trimmed === ms.title) return;
    try {
      await milestoneService.update(ms.id, { title: trimmed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function rescheduleMilestone(ms: Milestone, date: string) {
    if (!date || `${date}T00:00:00` === ms.date) return;
    await milestoneService.update(ms.id, { date: `${date}T00:00:00` });
  }

  async function toggleMilestone(ms: Milestone, done: boolean) {
    await milestoneService.update(ms.id, { doneAt: done ? new Date().toISOString() : null });
  }

  async function deleteMilestone() {
    if (!pendingDeleteMilestone) return;
    await milestoneService.remove(pendingDeleteMilestone.id);
    setPendingDeleteMilestone(null);
    toast.success(t("deleted"));
  }

  async function renameTaskTemplate(tpl: TaskTemplate, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tpl.name) return;
    await taskTemplateService.rename(tpl.id, trimmed);
  }

  async function deleteTaskTemplate() {
    if (!pendingDeleteTaskTpl) return;
    await taskTemplateService.remove(pendingDeleteTaskTpl.id);
    setPendingDeleteTaskTpl(null);
    toast.success(t("deleted"));
  }

  async function saveProjectAsTemplate() {
    try {
      await projectTemplateService.createFromProject(project, ptName);
      setPtName("");
      toast.success(t("projectTemplateSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
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
    <div className="page-pad">
      <nav className="tabs settings-tabs" aria-label={t("projectSettings")}>
        {(["basic", "members", "columns", "labels", "milestones", "templates", "danger"] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`tabs__item${tab === k ? " is-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {t(TAB_KEY[k])}
          </button>
        ))}
      </nav>

      {tab === "basic" && (
        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
        <section className="card">
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
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r])}</option>)}
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
        <section className="card">
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

      {tab === "labels" && (
        <section className="card">
          <ul className="user-list">
            {labels.map((l) => (
              <li key={l.id} className="user-row">
                <input
                  className="input"
                  style={{ maxWidth: 180 }}
                  defaultValue={l.name}
                  disabled={!canManage}
                  onBlur={(e) => void renameLabel(l, e.target.value)}
                  aria-label={t("labelName")}
                />
                <span className="label-color-picker" role="group" aria-label={t("labelColorAria", { color: l.color })}>
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot${l.color === c ? " is-selected" : ""}`}
                      style={{ background: c }}
                      disabled={!canManage}
                      onClick={() => void labelService.update(l.id, { color: c })}
                      aria-label={t("pickColorAria", { color: c })}
                    />
                  ))}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  className="btn btn--danger"
                  disabled={!canManage}
                  onClick={() => setPendingDeleteLabel(l)}
                  aria-label={t("deleteLabelAria", { name: l.name })}
                >
                  <Icon name="trash" size={14} />{t("actionDelete")}
                </button>
              </li>
            ))}
            {labels.length === 0 && <p className="empty">{t("noLabels")}</p>}
          </ul>
          {canManage && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                className="input"
                style={{ maxWidth: 220 }}
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder={t("addLabel")}
                aria-label={t("labelName")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addLabel(); } }}
              />
              <button className="btn" disabled={!newLabelName.trim()} onClick={() => void addLabel()}>
                <Icon name="plus" size={15} />{t("add")}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "milestones" && (
        <section className="card">
          {milestones.length > 0 && (
            <p className="hint" style={{ marginTop: 0 }}>
              {t("msProgress", { done: milestones.filter((m) => m.doneAt).length, total: milestones.length })}
            </p>
          )}
          <ul className="user-list">
            {milestones.map((ms) => (
              <li key={ms.id} className="user-row">
                <input
                  type="checkbox"
                  checked={Boolean(ms.doneAt)}
                  disabled={!canManage}
                  onChange={(e) => void toggleMilestone(ms, e.target.checked)}
                  aria-label={t("toggleMilestoneAria", { name: ms.title })}
                />
                <input
                  className="input"
                  style={{ maxWidth: 240 }}
                  defaultValue={ms.title}
                  disabled={!canManage}
                  onBlur={(e) => void renameMilestone(ms, e.target.value)}
                  aria-label={t("milestoneTitle")}
                />
                <input
                  type="date"
                  className="input"
                  style={{ maxWidth: 170 }}
                  defaultValue={ms.date.slice(0, 10)}
                  disabled={!canManage}
                  onBlur={(e) => void rescheduleMilestone(ms, e.target.value)}
                  aria-label={t("milestoneDate")}
                />
                <span style={{ flex: 1 }} />
                <button
                  className="btn btn--danger"
                  disabled={!canManage}
                  onClick={() => setPendingDeleteMilestone(ms)}
                  aria-label={t("deleteMilestoneAria", { name: ms.title })}
                >
                  <Icon name="trash" size={14} />{t("actionDelete")}
                </button>
              </li>
            ))}
            {milestones.length === 0 && <p className="empty">{t("noMilestones")}</p>}
          </ul>
          {canManage && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ maxWidth: 240 }}
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder={t("milestoneTitle")}
                aria-label={t("milestoneTitle")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addMilestone(); } }}
              />
              <input
                type="date"
                className="input"
                style={{ maxWidth: 170 }}
                value={msDate}
                onChange={(e) => setMsDate(e.target.value)}
                aria-label={t("milestoneDate")}
              />
              <button className="btn" disabled={!msTitle.trim() || !msDate} onClick={() => void addMilestone()}>
                <Icon name="plus" size={15} />{t("addMilestone")}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "templates" && (
        <div className="stack">
          <section className="card">
            <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="repeat" size={16} />
              {t("taskTemplateLib")}
            </h2>
            <p className="hint">{t("taskTemplateLibHint")}</p>
            <ul className="user-list">
              {taskTpls.map((tpl) => (
                <li key={tpl.id} className="user-row">
                  <Icon name="copy" size={15} />
                  <input
                    className="input"
                    style={{ maxWidth: 260 }}
                    defaultValue={tpl.name}
                    disabled={!canManage}
                    onBlur={(e) => void renameTaskTemplate(tpl, e.target.value)}
                    aria-label={t("templateNameAria", { name: tpl.name })}
                  />
                  <span className="hint" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tpl.title}
                    {tpl.subtasks.length > 0 && ` · ${tpl.subtasks.length}`}
                  </span>
                  <button
                    className="btn btn--danger"
                    disabled={!canManage}
                    onClick={() => setPendingDeleteTaskTpl(tpl)}
                    aria-label={t("deleteTemplateAria", { name: tpl.name })}
                  >
                    <Icon name="trash" size={14} />{t("actionDelete")}
                  </button>
                </li>
              ))}
              {taskTpls.length === 0 && <p className="empty">{t("noTaskTemplates")}</p>}
            </ul>
          </section>

          <section className="card">
            <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="kanban" size={16} />
              {t("saveProjectAsTemplate")}
            </h2>
            <p className="hint">{t("projectTemplateHint")}</p>
            {canManage && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  style={{ maxWidth: 280 }}
                  value={ptName}
                  onChange={(e) => setPtName(e.target.value)}
                  placeholder={project.name}
                  aria-label={t("projectTemplateName")}
                />
                <button className="btn" onClick={() => void saveProjectAsTemplate()}>
                  <Icon name="download" size={15} />{t("saveAsTemplate")}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "danger" && (
        <section className="danger-zone card">
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
      <ConfirmDialog
        open={Boolean(pendingDeleteLabel)}
        title={t("deleteLabelAria", { name: pendingDeleteLabel?.name ?? "" })}
        message={t("confirmDeleteLabel")}
        danger
        onConfirm={() => pendingDeleteLabel && void deleteLabel(pendingDeleteLabel)}
        onCancel={() => setPendingDeleteLabel(null)}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteMilestone)}
        title={t("deleteMilestoneAria", { name: pendingDeleteMilestone?.title ?? "" })}
        message={t("confirmDeleteMilestone")}
        danger
        onConfirm={() => void deleteMilestone()}
        onCancel={() => setPendingDeleteMilestone(null)}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteTaskTpl)}
        title={t("deleteTemplateAria", { name: pendingDeleteTaskTpl?.name ?? "" })}
        message={t("confirmDeleteTaskTemplate")}
        danger
        onConfirm={() => void deleteTaskTemplate()}
        onCancel={() => setPendingDeleteTaskTpl(null)}
      />
    </div>
  );
}
