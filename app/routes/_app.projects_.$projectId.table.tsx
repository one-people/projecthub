import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "@remix-run/react";
import { liveQuery } from "dexie";
import { Icon } from "~/components/ui/Icon";
import { TableView } from "~/components/table/TableView";
import { TaskDrawer } from "~/components/task/TaskDrawer";
import { taskService, PermissionError } from "~/services/task.service";
import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import type { CustomField } from "~/models/project";
import { t as translate, useI18n } from "~/lib/i18n";
import { can } from "~/auth/rbac";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("tableView") }) };

const PREF_KEY = "tableView";

interface TablePrefs {
  hidden: string[];
}

export default function TableRoute() {
  const { projectId } = useParams();
  const { project, role, actorId, users } = useOutletContext<ProjectOutletContext>();
  const toast = useToast();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDeleteField, setPendingDeleteField] = useState<CustomField | null>(null);

  useEffect(() => {
    if (!projectId) return;
    void db.preferences.get(`${PREF_KEY}:${projectId}`).then((row) => {
      const prefs = (row?.value as TablePrefs | undefined) ?? { hidden: [] };
      setHidden(new Set(prefs.hidden));
    });
  }, [projectId]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.tasks.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setTasks(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.labels.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setLabels(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  const assigneeNames = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const canEdit = can(role, "task:update");
  const canManageFields = can(role, "project:update");
  const canCreate = can(role, "task:create");

  const visible = search.trim()
    ? tasks.filter((tk) => tk.title.toLowerCase().includes(search.trim().toLowerCase()))
    : tasks;
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  function guard(e: unknown) {
    if (e instanceof PermissionError) {
      toast.error(e.message);
      return true;
    }
    return false;
  }

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      void db.preferences.put({ key: `${PREF_KEY}:${project.id}`, value: { hidden: [...next] } });
      return next;
    });
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    try {
      await taskService.updateTask(actorId, role, taskId, patch);
    } catch (e) {
      guard(e);
    }
  }

  async function updateProjectFields(fn: (fields: CustomField[]) => CustomField[]) {
    await db.projects.update(project.id, {
      customFields: fn(project.customFields ?? []),
      updatedAt: new Date().toISOString(),
    });
  }

  async function deleteField(field: CustomField) {
    setPendingDeleteField(null);
    await db.transaction("rw", [db.projects, db.tasks], async () => {
      await db.projects.update(project.id, {
        customFields: (project.customFields ?? []).filter((f) => f.id !== field.id),
        updatedAt: new Date().toISOString(),
      });
      await db.tasks
        .where("projectId")
        .equals(project.id)
        .filter((tk) => (tk.customValues ?? {})[field.id] !== undefined)
        .modify((tk) => {
          const values = { ...(tk.customValues ?? {}) };
          delete values[field.id];
          tk.customValues = values;
        });
    });
    toast.success(t("deleted"));
  }

  return (
    <div className="list-page">
      <div className="db-toolbar">
        <label className="db-toolbar__search">
          <Icon name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchTasks")}
            aria-label={t("searchTasks")}
          />
        </label>
        <span className="db-toolbar__spacer" />
        <span className="db-toolbar__count">{t("taskCountLabel", { count: visible.length })}</span>
      </div>
      <div className="list-page__body card" aria-label={t("tableView")}>
        <TableView
          tasks={visible}
          columns={[...project.statusColumns].sort((a, b) => a.order - b.order)}
          assigneeNames={assigneeNames}
          labels={labels}
          customFields={project.customFields ?? []}
          hidden={hidden}
          canEdit={canEdit}
          canManageFields={canManageFields}
          onOpenTask={(task) => setOpenTaskId(task.id)}
          onPatch={patchTask}
          onToggleColumn={toggleColumn}
          onAddField={(field) => void updateProjectFields((fields) => [...fields, field])}
          onUpdateField={(fieldId, patch) =>
            void updateProjectFields((fields) => fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)))}
          onDeleteField={(fieldId) => {
            const field = (project.customFields ?? []).find((f) => f.id === fieldId);
            if (field) setPendingDeleteField(field);
          }}
        />
        {creating ? (
          <form
            className="db-newrow"
            onSubmit={async (e) => {
              e.preventDefault();
              const title = newTitle.trim();
              if (!title) return;
              const firstColumn = project.statusColumns.find((c) => c.order === 0);
              if (!firstColumn) return;
              try {
                await taskService.create(actorId, role, {
                  id: uuid(),
                  projectId: project.id,
                  title,
                  status: firstColumn.id,
                });
                setNewTitle("");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("createFailed"));
              }
            }}
          >
            <input
              autoFocus
              className="db-newrow__input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("newTaskTitle")}
              aria-label={t("newTaskTitle")}
              onKeyDown={(e) => {
                if (e.key === "Escape") setCreating(false);
                if (e.key === "Enter") e.currentTarget.form?.requestSubmit();
              }}
            />
            <span className="db-newrow__hint">{t("enterToCreate")}</span>
          </form>
        ) : canCreate ? (
          <button className="db-newrow__trigger" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            {t("newTaskTitle")}
          </button>
        ) : null}
      </div>
      <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} />
      <ConfirmDialog
        open={Boolean(pendingDeleteField)}
        title={t("deleteFieldAria", { name: pendingDeleteField?.name ?? "" })}
        message={t("confirmDeleteField")}
        danger
        onConfirm={() => pendingDeleteField && void deleteField(pendingDeleteField)}
        onCancel={() => setPendingDeleteField(null)}
      />
    </div>
  );
}
