import { useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { Icon } from "~/components/ui/Icon";
import { FilterChips } from "~/components/list/FilterChips";
import { EMPTY_FILTERS, type Filters } from "~/lib/list-view";
import { SortMenu, type SortRule } from "~/components/list/SortMenu";
import { ListTable } from "~/components/list/ListTable";
import { TaskDialog } from "~/components/task/TaskDialog";
import { taskService } from "~/services/task.service";
import { projectRepository } from "~/repositories/project.repository";
import { db } from "~/repositories/db";
import { applyFilters, applySort } from "~/lib/list-query";
import { uuid } from "~/lib/id";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";
import { t as translate, useI18n } from "~/lib/i18n";
import { session } from "~/auth/session";
import { can, type RoleId } from "~/auth/rbac";
import { trashService } from "~/services/trash.service";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";

export const handle = { crumb: () => ({ label: translate("list") }) };

const PREF_KEY = "listView";

async function loadPrefs(projectId: string): Promise<{ filters: Filters; sort: SortRule }> {
  const row = await db.preferences.get(`${PREF_KEY}:${projectId}`);
  if (row) return row.value as { filters: Filters; sort: SortRule };
  return { filters: EMPTY_FILTERS, sort: { field: "updatedAt", direction: "desc" } };
}

async function savePrefs(projectId: string, prefs: { filters: Filters; sort: SortRule }) {
  await db.preferences.put({ key: `${PREF_KEY}:${projectId}`, value: prefs });
}

export default function ListRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortRule>({ field: "updatedAt", direction: "desc" });
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [me, setMe] = useState<{ id: string; role: RoleId } | null>(null);
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const projectId = window.location.pathname.split("/")[2] ?? "";

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const p = await projectRepository.get(projectId);
      if (!p) {
        navigate("/projects");
        return;
      }
      const [users, prefs] = await Promise.all([
        db.users.toArray(),
        loadPrefs(p.id),
      ]);
      setProject(p);
      setAssigneeNames(Object.fromEntries(users.map((u) => [u.id, u.name])));
      const current = await session.currentUser();
      setMe({ id: current.id, role: (p.memberRoles[current.id] as RoleId | undefined) ?? "member" });
      setFilters(prefs.filters);
      setSort(prefs.sort);
      // liveQuery：本页与其他标签页对任务表的任何变更都会实时刷新
      const sub = liveQuery(() =>
        db.tasks.where("projectId").equals(p.id).toArray(),
      ).subscribe((rows) => setTasks(rows));
      unsubscribe = () => sub.unsubscribe();
    })();
    return () => unsubscribe?.();
  }, [projectId, navigate]);

  function updatePrefs(next: { filters?: Filters; sort?: SortRule }) {
    const merged = { filters: next.filters ?? filters, sort: next.sort ?? sort };
    setFilters(merged.filters);
    setSort(merged.sort);
    void savePrefs(projectId, merged);
  }

  if (!project) return <main className="page"><p className="empty">{t("loading")}</p></main>;

  const canCreate = me ? can(me.role, "task:create") : false;

  const searched = search.trim()
    ? tasks.filter((tk) => tk.title.toLowerCase().includes(search.trim().toLowerCase()))
    : tasks;
  const visible = applySort(applyFilters(searched, filters), sort);

  return (
    <main>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{project.name}</h1>
        <span className="page-toolbar__spacer" />
        <nav className="segmented" aria-label={t("viewSwitch")}>
          <button
            className="segmented__item"
            onClick={() => navigate(`/projects/${project.id}/board`)}
          >
            <Icon name="kanban" size={15} />
            {t("board")}
          </button>
          <span className="segmented__item segmented__item--active">
            <Icon name="list" size={15} />
            {t("list")}
          </span>
          <button
            className="segmented__item"
            onClick={() => navigate(`/projects/${project.id}/settings`)}
          >
            <Icon name="settings" size={15} />
            {t("settings")}
          </button>
        </nav>
      </div>
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
        />
        <SortMenu rule={sort} onChange={(s) => updatePrefs({ sort: s })} />
        <span className="db-toolbar__spacer" />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const title = newTitle.trim();
            if (!title || !project || !me) return;
            const firstColumn = project.statusColumns.find((c) => c.order === 0);
            if (!firstColumn) return;
            try {
              await taskService.create(me.id, me.role, {
                id: uuid(),
                projectId: project.id,
                title,
                status: firstColumn.id,
              });
              setNewTitle("");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : t("createFailed"));
            }
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            className="input"
            style={{ width: 200 }}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("newTaskTitle")}
            aria-label={t("newTaskTitle")}
            disabled={!canCreate}
            title={canCreate ? undefined : t("noCreatePermission")}
          />
          <button className="btn btn--primary" type="submit" disabled={!canCreate}>{t("createNew")}</button>
        </form>
      </div>
      <div className="card" style={{ padding: "0 8px 8px", margin: "0 16px 16px" }} aria-label={t("taskList")}>
        <ListTable
          tasks={visible}
          columns={project.statusColumns}
          assigneeNames={assigneeNames}
          onOpenTask={setOpenTask}
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
      </div>
      {selected.size > 0 && (
        <div className="db-actionbar" role="toolbar" aria-label={t("batchActions")}>
          <span className="db-actionbar__count">{t("selectedCount", { count: selected.size })}</span>
          {me && can(me.role, "task:delete") && (
            <button className="db-actionbar__btn db-actionbar__btn--danger" onClick={() => setConfirmBatch(true)}>
              {t("batchDelete")}
            </button>
          )}
          <button className="db-actionbar__btn" onClick={() => setSelected(new Set())}>
            {t("cancel")}
          </button>
        </div>
      )}
      <TaskDialog
        task={openTask ? tasks.find((t) => t.id === openTask.id) ?? openTask : null}
        statusName={project.statusColumns.find((c) => c.id === openTask?.status)?.name}
        onClose={() => setOpenTask(null)}
      />
      <ConfirmDialog
        open={confirmBatch}
        title={t("batchDelete")}
        message={t("confirmBatchDelete")}
        danger
        onConfirm={async () => {
          if (!me) return;
          const ids = [...selected];
          for (const id of ids) {
            await trashService.deleteTask(me.id, me.role, id);
          }
          setSelected(new Set());
          setConfirmBatch(false);
          toast.success(`${t("deleted")}（${ids.length}）`, {
            undo: async () => {
              for (const id of ids) {
                await trashService.restoreTask(me.id, me.role, id);
              }
            },
          });
        }}
        onCancel={() => setConfirmBatch(false)}
      />
    </main>
  );
}
