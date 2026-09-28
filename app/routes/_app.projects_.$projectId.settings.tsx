import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { can, type MemberRole, type RoleId } from "~/auth/rbac";
import { trashService } from "~/services/trash.service";
import { projectService } from "~/services/project.service";
import { labelService } from "~/services/label.service";
import { milestoneService } from "~/services/milestone.service";
import { taskTemplateService } from "~/services/taskTemplate.service";
import { projectTemplateService } from "~/services/projectTemplate.service";
import { automationService } from "~/services/automation.service";
import { LABEL_COLORS, type Label } from "~/models/label";
import type { Milestone } from "~/models/milestone";
import type { StatusColumn } from "~/models/project";
import type { TaskTemplate } from "~/models/taskTemplate";
import type { Automation } from "~/models/automation";
import type { User } from "~/models/user";
import { uuid } from "~/lib/id";
import { useI18n, t as translate } from "~/lib/i18n";
import type { Dict } from "~/locales/zh-CN";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";
import { PRIORITY_LABEL_KEY } from "~/lib/priority";
import { Icon } from "~/components/ui/Icon";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("projectSettings") }) };

type Tab = "basic" | "members" | "columns" | "labels" | "milestones" | "templates" | "automations" | "danger";
/** 成员可选角色：owner 由 ownerId 唯一标记，只能通过「移交所有权」变更 */
const ROLE_OPTIONS: MemberRole[] = ["admin", "member", "guest"];

const TAB_KEY: Record<Tab, keyof Dict> = {
  basic: "tabBasic",
  members: "tabMembers",
  columns: "tabColumns",
  labels: "tabLabels",
  milestones: "tabMilestones",
  templates: "tabTemplates",
  automations: "tabAutomations",
  danger: "tabDanger",
};

const TRIGGER_OPTIONS: Automation["trigger"]["type"][] = ["task_created", "status_entered", "task_completed"];
const ACTION_OPTIONS: Automation["action"]["type"][] = ["assign", "set_priority", "move_to", "add_label"];
const PRIORITY_OPTIONS: Array<"urgent" | "high" | "medium" | "low" | "none"> = ["urgent", "high", "medium", "low", "none"];

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
  const [pendingTransfer, setPendingTransfer] = useState<User | null>(null);
  const [newUserName, setNewUserName] = useState("");
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
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [auName, setAuName] = useState("");
  const [auTrigger, setAuTrigger] = useState<Automation["trigger"]["type"]>("task_created");
  const [auColumn, setAuColumn] = useState("");
  const [auAction, setAuAction] = useState<Automation["action"]["type"]>("assign");
  const [auValue, setAuValue] = useState("");
  const [pendingDeleteAutomation, setPendingDeleteAutomation] = useState<Automation | null>(null);

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

  useEffect(() => {
    const sub = liveQuery(() =>
      db.automations.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => {
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setAutomations(rows);
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
    try {
      await projectService.updateBasic(current.id, actorId, { name: trimmed, description: desc });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function changeMemberRole(userId: string, nextRole: MemberRole) {
    try {
      await projectService.setMemberRole(current.id, actorId, userId, nextRole);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function removeMember(userId: string) {
    try {
      await projectService.removeMember(current.id, actorId, userId);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
      return;
    }
    setPendingRemove(null);
  }

  async function addMember(userId: string) {
    try {
      await projectService.addMember(current.id, actorId, userId);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function transferOwnership() {
    if (!pendingTransfer) return;
    try {
      await projectService.transferOwnership(current.id, actorId, pendingTransfer.id);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
      return;
    }
    setPendingTransfer(null);
  }

  async function createMemberUser() {
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    try {
      await projectService.createMemberUser(current.id, actorId, trimmed);
      setNewUserName("");
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function saveColumns(statusColumns: StatusColumn[]) {
    try {
      await projectService.updateColumns(current.id, actorId, statusColumns);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
      return false;
    }
  }

  async function addColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const order = Math.max(...current.statusColumns.map((c) => c.order), -1) + 1;
    const ok = await saveColumns([...current.statusColumns, { id: uuid(), name: trimmed, isDone: false, order }]);
    if (!ok) return;
    setNewColumnName("");
    toast.success(t("saved"));
  }

  async function updateColumn(colId: string, patch: Partial<{ name: string; isDone: boolean }>) {
    await saveColumns(current.statusColumns.map((c) => (c.id === colId ? { ...c, ...patch } : c)));
  }

  async function deleteColumn(colId: string) {
    if (!(await saveColumns(current.statusColumns.filter((c) => c.id !== colId)))) return;
    toast.success(t("saved"));
  }

  async function moveColumn(index: number, delta: -1 | 1) {
    const target = index + delta;
    const cols = [...current.statusColumns].sort((a, b) => a.order - b.order);
    if (target < 0 || target >= cols.length) return;
    [cols[index], cols[target]] = [cols[target]!, cols[index]!];
    await saveColumns(cols.map((c, i) => ({ ...c, order: i })));
  }

  async function addLabel() {
    const trimmed = newLabelName.trim();
    if (!trimmed) return;
    try {
      await labelService.create(actorId, project.id, trimmed);
      setNewLabelName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function renameLabel(label: Label, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === label.name) return;
    try {
      await labelService.update(actorId, label.id, { name: trimmed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function recolorLabel(label: Label, color: string) {
    try {
      await labelService.update(actorId, label.id, { color });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteLabel(label: Label) {
    setPendingDeleteLabel(null);
    try {
      await labelService.remove(actorId, label.id);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function addMilestone() {
    if (!msTitle.trim() || !msDate) return;
    try {
      await milestoneService.create(actorId, project.id, msTitle, `${msDate}T00:00:00`);
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
      await milestoneService.update(actorId, ms.id, { title: trimmed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function rescheduleMilestone(ms: Milestone, date: string) {
    if (!date || `${date}T00:00:00` === ms.date) return;
    try {
      await milestoneService.update(actorId, ms.id, { date: `${date}T00:00:00` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function toggleMilestone(ms: Milestone, done: boolean) {
    try {
      await milestoneService.update(actorId, ms.id, { doneAt: done ? new Date().toISOString() : null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteMilestone() {
    if (!pendingDeleteMilestone) return;
    try {
      await milestoneService.remove(actorId, pendingDeleteMilestone.id);
      setPendingDeleteMilestone(null);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function renameTaskTemplate(tpl: TaskTemplate, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tpl.name) return;
    try {
      await taskTemplateService.rename(actorId, tpl.id, trimmed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteTaskTemplate() {
    if (!pendingDeleteTaskTpl) return;
    try {
      await taskTemplateService.remove(actorId, pendingDeleteTaskTpl.id);
      setPendingDeleteTaskTpl(null);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function saveProjectAsTemplate() {
    try {
      await projectTemplateService.createFromProject(actorId, project, ptName);
      setPtName("");
      toast.success(t("projectTemplateSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function addAutomation() {
    try {
      await automationService.create(actorId, project.id, {
        name: auName,
        trigger: { type: auTrigger, columnId: auTrigger === "status_entered" ? auColumn : null },
        action: { type: auAction, value: auAction === "set_priority" ? auValue || "none" : auValue || null },
      });
      setAuName("");
      setAuValue("");
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function toggleAutomation(rule: Automation, enabled: boolean) {
    try {
      await automationService.update(actorId, rule.id, { enabled });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteAutomation() {
    if (!pendingDeleteAutomation) return;
    try {
      await automationService.remove(actorId, pendingDeleteAutomation.id);
      setPendingDeleteAutomation(null);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteProject() {
    if (confirmText !== current.name) return;
    try {
      await trashService.deleteProject(actorId, current.id);
      toast.success(t("deleted"), {
        undo: async () => {
          try {
            await trashService.restoreProject(actorId, current.id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("updateFailed"));
          }
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
      return;
    }
    navigate("/projects");
  }

  const sortedColumns = [...project.statusColumns].sort((a, b) => a.order - b.order);
  const nonMembers = users.filter((u) => !project.memberRoles[u.id]);
  const members = users.filter((u) => project.memberRoles[u.id]);
  const isOwner = role === "owner";

  return (
    <div className="page-pad">
      <nav className="tabs settings-tabs" aria-label={t("projectSettings")}>
        {/* 危险区仅所有者可见（删除/恢复走 project:delete） */}
        {(["basic", "members", "columns", "labels", "milestones", "templates", "automations", "danger"] as Tab[])
          .filter((k) => k !== "danger" || isOwner)
          .map((k) => (
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
            {members.map((u) => {
              const isOwnerRow = project.ownerId === u.id;
              const isSelf = u.id === actorId;
              const memberRole = project.memberRoles[u.id] as MemberRole | undefined;
              // admin 级成员的增删改仅 owner；自己的角色与所有者不可在此变更
              const adminLocked = role !== "owner" && memberRole === "admin";
              const canEditRole = canManage && !isOwnerRow && !isSelf && !adminLocked;
              const canRemove = canManage && !isOwnerRow && !isSelf && !adminLocked;
              const roleOptions = role === "owner" ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r !== "admin");
              return (
                <li key={u.id} className="user-row">
                  <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
                  <strong style={{ flex: 1 }}>
                    {u.name}
                    {isSelf && <span className="hint">{t("itsYou")}</span>}
                  </strong>
                  {isOwnerRow ? (
                    <span className="badge badge--role">{t(ROLE_LABEL_KEY.owner)}</span>
                  ) : canEditRole ? (
                    <select
                      className="input"
                      value={memberRole}
                      onChange={(e) => void changeMemberRole(u.id, e.target.value as MemberRole)}
                      aria-label={`${u.name} ${t("tabMembers")}`}
                    >
                      {roleOptions.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r])}</option>)}
                    </select>
                  ) : (
                    memberRole && <span className="badge">{t(ROLE_LABEL_KEY[memberRole])}</span>
                  )}
                  {canRemove && (
                    <button className="btn btn--danger" onClick={() => setPendingRemove(u.id)}>
                      <Icon name="close" size={14} />{t("removeMember")}
                    </button>
                  )}
                  {role === "owner" && !isOwnerRow && (
                    <button
                      className="icon-btn"
                      onClick={() => setPendingTransfer(u)}
                      aria-label={t("transferOwnershipAria", { name: u.name })}
                      title={t("transferOwnership")}
                    >
                      <Icon name="flag" size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {canManage && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              {nonMembers.length > 0 && (
                <>
                  <span className="field-label" style={{ margin: 0 }}>{t("addMember")}</span>
                  <select className="input" value="" onChange={(e) => e.target.value && void addMember(e.target.value)} aria-label={t("addMember")}>
                    <option value="">—</option>
                    {nonMembers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </>
              )}
              <input
                className="input"
                style={{ maxWidth: 220 }}
                value={newUserName}
                placeholder={t("newUserNamePlaceholder")}
                aria-label={t("newUserNamePlaceholder")}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void createMemberUser(); }}
              />
              <button className="btn" disabled={!newUserName.trim()} onClick={() => void createMemberUser()}>
                <Icon name="plus" size={14} />{t("createAndAdd")}
              </button>
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
                      onClick={() => void recolorLabel(l, c)}
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

      {tab === "automations" && (
        <section className="card">
          <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="zap" size={16} />
            {t("tabAutomations")}
          </h2>
          <p className="hint">{t("automationHint")}</p>
          <ul className="user-list">
            {automations.map((rule) => {
              const colName = rule.trigger.columnId
                ? project.statusColumns.find((c) => c.id === rule.trigger.columnId)?.name ?? "?"
                : "";
              const assignee = rule.action.type === "assign"
                ? users.find((u) => u.id === rule.action.value)?.name ?? "?"
                : "";
              const targetCol = rule.action.type === "move_to"
                ? project.statusColumns.find((c) => c.id === rule.action.value)?.name ?? "?"
                : "";
              const label = rule.action.type === "add_label"
                ? labels.find((l) => l.id === rule.action.value)
                : undefined;
              return (
                <li key={rule.id} className="user-row">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={!canManage}
                    onChange={(e) => void toggleAutomation(rule, e.target.checked)}
                    aria-label={t("automationToggleAria", { name: rule.name })}
                  />
                  <span style={{ minWidth: 120, fontWeight: 600, fontSize: 13 }}>{rule.name}</span>
                  <span className="auto-rule">
                    {rule.trigger.type === "task_created" && t("autoWhenCreated")}
                    {rule.trigger.type === "task_completed" && t("autoWhenCompleted")}
                    {rule.trigger.type === "status_entered" && t("autoWhenEntered", { column: colName })}
                    {" → "}
                    {rule.action.type === "assign" && t("autoThenAssign", { name: assignee })}
                    {rule.action.type === "set_priority" && t("autoThenPriority", { priority: t(PRIORITY_LABEL_KEY[(rule.action.value ?? "none") as keyof typeof PRIORITY_LABEL_KEY]) })}
                    {rule.action.type === "move_to" && t("autoThenMove", { column: targetCol })}
                    {rule.action.type === "add_label" && (
                      <span className="auto-rule__label">
                        {label && <span className="label-dot" style={{ background: label.color }} />}
                        {t("autoThenLabel", { name: label?.name ?? "?" })}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    className="btn btn--danger"
                    disabled={!canManage}
                    onClick={() => setPendingDeleteAutomation(rule)}
                    aria-label={t("deleteAutomationAria", { name: rule.name })}
                  >
                    <Icon name="trash" size={14} />{t("actionDelete")}
                  </button>
                </li>
              );
            })}
            {automations.length === 0 && <p className="empty">{t("noAutomations")}</p>}
          </ul>
          {canManage && (
            <div className="auto-form">
              <input
                className="input"
                style={{ maxWidth: 160 }}
                value={auName}
                onChange={(e) => setAuName(e.target.value)}
                placeholder={t("automationName")}
                aria-label={t("automationName")}
              />
              <select
                className="input"
                value={auTrigger}
                onChange={(e) => { setAuTrigger(e.target.value as Automation["trigger"]["type"]); setAuColumn(""); }}
                aria-label={t("automationTrigger")}
              >
                {TRIGGER_OPTIONS.map((tr) => (
                  <option key={tr} value={tr}>
                    {tr === "task_created" ? t("autoWhenCreated") : tr === "task_completed" ? t("autoWhenCompleted") : t("autoTriggerEntered")}
                  </option>
                ))}
              </select>
              {auTrigger === "status_entered" && (
                <select
                  className="input"
                  value={auColumn}
                  onChange={(e) => setAuColumn(e.target.value)}
                  aria-label={t("automationColumn")}
                >
                  <option value="">{t("automationColumn")}</option>
                  {sortedColumns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <select
                className="input"
                value={auAction}
                onChange={(e) => { setAuAction(e.target.value as Automation["action"]["type"]); setAuValue(""); }}
                aria-label={t("automationAction")}
              >
                {ACTION_OPTIONS.map((ac) => (
                  <option key={ac} value={ac}>
                    {ac === "assign" ? t("autoActionAssign") : ac === "set_priority" ? t("autoActionPriority") : ac === "move_to" ? t("autoActionMove") : t("autoActionLabel")}
                  </option>
                ))}
              </select>
              {auAction !== "set_priority" && (
                <select
                  className="input"
                  value={auValue}
                  onChange={(e) => setAuValue(e.target.value)}
                  aria-label={t("automationTarget")}
                >
                  <option value="">{t("automationTarget")}</option>
                  {auAction === "assign" && users.filter((u) => project.memberRoles[u.id]).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                  {auAction === "move_to" && sortedColumns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {auAction === "add_label" && labels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}
              {auAction === "set_priority" && (
                <select
                  className="input"
                  value={auValue}
                  onChange={(e) => setAuValue(e.target.value)}
                  aria-label={t("automationTarget")}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{t(PRIORITY_LABEL_KEY[p])}</option>
                  ))}
                </select>
              )}
              <button
                className="btn"
                disabled={!auName.trim() || (auTrigger === "status_entered" && !auColumn) || (auAction !== "set_priority" && !auValue)}
                onClick={() => void addAutomation()}
              >
                <Icon name="plus" size={15} />{t("add")}
              </button>
            </div>
          )}
        </section>
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
        open={Boolean(pendingTransfer)}
        title={t("transferOwnership")}
        message={t("confirmTransferOwnership", { name: pendingTransfer?.name ?? "" })}
        danger
        onConfirm={() => void transferOwnership()}
        onCancel={() => setPendingTransfer(null)}
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
      <ConfirmDialog
        open={Boolean(pendingDeleteAutomation)}
        title={t("deleteAutomationAria", { name: pendingDeleteAutomation?.name ?? "" })}
        message={t("confirmDeleteAutomation")}
        danger
        onConfirm={() => void deleteAutomation()}
        onCancel={() => setPendingDeleteAutomation(null)}
      />
    </div>
  );
}
