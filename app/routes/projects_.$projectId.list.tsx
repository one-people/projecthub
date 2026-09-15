import { useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { Icon } from "~/components/ui/Icon";
import { FilterBar, EMPTY_FILTERS, type Filters } from "~/components/list/FilterBar";
import { SortMenu, type SortRule } from "~/components/list/SortMenu";
import { ListTable } from "~/components/list/ListTable";
import { TaskDialog } from "~/components/task/TaskDialog";
import { taskService } from "~/services/task.service";
import { projectRepository } from "~/repositories/project.repository";
import { db } from "~/repositories/db";
import { applyFilters, applySort } from "~/lib/list-query";
import type { Project } from "~/models/project";
import type { Task } from "~/models/task";

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
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortRule>({ field: "updatedAt", direction: "desc" });
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const projectId = window.location.pathname.split("/")[2] ?? "";

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const p = await projectRepository.get(projectId);
      if (!p) {
        navigate("/");
        return;
      }
      const [users, prefs] = await Promise.all([
        db.users.toArray(),
        loadPrefs(p.id),
      ]);
      setProject(p);
      setAssigneeNames(Object.fromEntries(users.map((u) => [u.id, u.name])));
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

  if (!project) return <main className="page"><p className="empty">加载中…</p></main>;

  const visible = applySort(applyFilters(tasks, filters), sort);

  return (
    <main>
      <header className="app-header">
        <button
          className="app-header__back"
          onClick={() => navigate("/")}
          aria-label="返回项目列表"
        >
          <Icon name="back" size={18} />
        </button>
        <span className="app-header__title">{project.name}</span>
        <nav className="segmented" aria-label="视图切换">
          <button
            className="segmented__item"
            onClick={() => navigate(`/projects/${project.id}/board`)}
          >
            <Icon name="kanban" size={15} />
            看板
          </button>
          <span className="segmented__item segmented__item--active">
            <Icon name="list" size={15} />
            列表
          </span>
        </nav>
      </header>
      <div className="toolbar">
        <FilterBar
          filters={filters}
          onChange={(f) => updatePrefs({ filters: f })}
          assigneeOptions={Object.entries(assigneeNames).map(([id, name]) => ({ id, name }))}
        />
        <SortMenu rule={sort} onChange={(s) => updatePrefs({ sort: s })} />
      </div>
      <div style={{ padding: "0 16px 16px" }} className="card" aria-label="任务列表">
        <ListTable
          tasks={visible}
          columns={project.statusColumns}
          assigneeNames={assigneeNames}
          onOpenTask={setOpenTask}
        />
      </div>
      <TaskDialog
        task={openTask ? tasks.find((t) => t.id === openTask.id) ?? openTask : null}
        statusName={project.statusColumns.find((c) => c.id === openTask?.status)?.name}
        onClose={() => setOpenTask(null)}
      />
    </main>
  );
}
