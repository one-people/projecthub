import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "@remix-run/react";
import { liveQuery } from "dexie";
import { Icon } from "~/components/ui/Icon";
import { FilterChips } from "~/components/list/FilterChips";
import { EMPTY_FILTERS, type Filters } from "~/lib/list-view";
import type { SortRule } from "~/components/list/SortMenu";
import { ListTable } from "~/components/list/ListTable";
import { TaskDrawer } from "~/components/task/TaskDrawer";
import { taskService } from "~/services/task.service";
import { db } from "~/repositories/db";
import { applyFilters, applySort } from "~/lib/list-query";
import { uuid } from "~/lib/id";
import type { Task } from "~/models/task";
import type { Label } from "~/models/label";
import { t as translate, useI18n } from "~/lib/i18n";
import { can } from "~/auth/rbac";
import { trashService } from "~/services/trash.service";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("list") }) };

const PREF_KEY = "listView";

export default function ListRoute() {
  const { projectId } = useParams();
  const { project, role, actorId, users } = useOutletContext<ProjectOutletContext>();
  const toast = useToast();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortRule>({ field: "updatedAt", direction: "desc" });
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    void loadPrefs(projectId).then((prefs) => {
      setFilters(prefs.filters);
      setSort(prefs.sort);
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

  const assigneeNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  function updatePrefs(next: { filters?: Filters; sort?: SortRule }) {
    const merged = { filters: next.filters ?? filters, sort: next.sort ?? sort };
    setFilters(merged.filters);
    setSort(merged.sort);
    void savePrefs(project.id, merged);
  }

  const canCreate = can(role, "task:create");

  const searched = search.trim()
    ? tasks.filter((tk) => tk.title.toLowerCase().includes(search.trim().toLowerCase()))
    : tasks;
  const visible = applySort(applyFilters(searched, filters), sort);
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

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
        <FilterChips
          filters={filters}
          onChange={(f) => updatePrefs({ filters: f })}
          assigneeOptions={Object.entries(assigneeNames).map(([id, name]) => ({ id, name }))}
          labelOptions={labels.map((l) => ({ id: l.id, name: l.name }))}
        />
        <span className="db-toolbar__spacer" />
        <span className="db-toolbar__count">{t("taskCountLabel", { count: visible.length })}</span>
      </div>
      <div className="list-page__body card" aria-label={t("taskList")}>
        <ListTable
          tasks={visible}
          columns={project.statusColumns}
          assigneeNames={assigneeNames}
          labelDefs={labels}
          onOpenTask={(task) => setOpenTaskId(task.id)}
          sort={sort}
          onSortChange={(s) => updatePrefs({ sort: s })}
          selection={{
            selected,
            onToggle: (taskId) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(taskId)) next.delete(taskId);
                else next.add(taskId);
                return next;
              }),
            onToggleAll: () =>
              setSelected((prev) =>
                prev.size === visible.length ? new Set() : new Set(visible.map((tk) => tk.id)),
              ),
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
      {selected.size > 0 && (
        <div className="db-actionbar" role="toolbar" aria-label={t("batchActions")}>
          <span className="db-actionbar__count">{t("selectedCount", { count: selected.size })}</span>
          {can(role, "task:delete") && (
            <button className="db-actionbar__btn db-actionbar__btn--danger" onClick={() => setConfirmBatch(true)}>
              {t("batchDelete")}
            </button>
          )}
          <button className="db-actionbar__btn" onClick={() => setSelected(new Set())}>
            {t("cancel")}
          </button>
        </div>
      )}
      <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} onOpenTask={setOpenTaskId} />
      <ConfirmDialog
        open={confirmBatch}
        title={t("batchDelete")}
        message={t("confirmBatchDelete")}
        danger
        onConfirm={async () => {
          const ids = [...selected];
          for (const id of ids) {
            await trashService.deleteTask(actorId, role, id);
          }
          setSelected(new Set());
          setConfirmBatch(false);
          toast.success(`${t("deleted")}（${ids.length}）`, {
            undo: async () => {
              for (const id of ids) {
                await trashService.restoreTask(actorId, role, id);
              }
            },
          });
        }}
        onCancel={() => setConfirmBatch(false)}
      />
    </div>
  );
}

async function loadPrefs(projectId: string): Promise<{ filters: Filters; sort: SortRule }> {
  const row = await db.preferences.get(`${PREF_KEY}:${projectId}`);
  if (row) return row.value as { filters: Filters; sort: SortRule };
  return { filters: EMPTY_FILTERS, sort: { field: "updatedAt", direction: "desc" } };
}

async function savePrefs(projectId: string, prefs: { filters: Filters; sort: SortRule }) {
  await db.preferences.put({ key: `${PREF_KEY}:${projectId}`, value: prefs });
}
