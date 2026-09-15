import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { workbenchService, type WorkbenchData } from "~/services/workbench.service";
import { PRIORITY_META } from "~/lib/priority";
import { formatDate, isOverdue } from "~/lib/date";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { TaskDialog } from "~/components/task/TaskDialog";
import type { Task } from "~/models/task";
import type { Project } from "~/models/project";

type Tab = "pending" | "today" | "overdue" | "recent";

export const handle = { crumb: () => ({ label: translate("workbench") }) };

export default function WorkbenchRoute() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [openTask, setOpenTask] = useState<Task | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const me = await session.currentUser();
      const sub = liveQuery(() => workbenchService.load(me.id)).subscribe(setData);
      unsub = () => sub.unsubscribe();
    })();
    const sub2 = liveQuery(() => db.projects.toArray()).subscribe(setProjects);
    return () => {
      unsub?.();
      sub2.unsubscribe();
    };
  }, []);

  const statusName = useMemo(() => {
    const p = projects.find((p) => p.id === openTask?.projectId);
    return p?.statusColumns.find((c) => c.id === openTask?.status)?.name;
  }, [projects, openTask]);

  if (!data) {
    return <div className="workbench"><div className="skeleton" style={{ height: 120 }} /></div>;
  }

  const groups: Record<Tab, string> = {
    pending: t("tabPending"),
    today: t("tabToday"),
    overdue: t("tabOverdue"),
    recent: t("tabRecent"),
  };
  const rows = data[tab];
  const hour = new Date().getHours();
  const greet = hour < 12 ? t("goodMorning") : hour < 18 ? t("goodAfternoon") : t("goodEvening");
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="workbench">
      <div className="workbench__hero">
        <h1 style={{ fontSize: 20, margin: 0 }}>{greet}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge">{t("todayDue")} {data.today.length}</span>
          <span className="badge badge--danger">{t("overdueCount")} {data.overdue.length}</span>
        </div>
      </div>

      <div className="workbench__body">
        <section className="card" aria-label={t("myTasks")}>
          <nav className="segmented" aria-label={t("myTasks")}>
            {(Object.keys(groups) as Tab[]).map((k) => (
              <button
                key={k}
                className={`segmented__item${tab === k ? " segmented__item--active" : ""}`}
                onClick={() => setTab(k)}
              >
                {groups[k]}（{data[k].length}）
              </button>
            ))}
          </nav>
          <ul className="my-task-list">
            {rows.map((task) => (
              <li key={task.id}>
                <button className="my-task" onClick={() => setOpenTask(task)}>
                  <span className={`prio prio--${task.priority}`}>
                    <span className="prio__dot" style={{ background: PRIORITY_META[task.priority].color }} />
                    {PRIORITY_META[task.priority].label}
                  </span>
                  <span className="my-task__title">{task.title}</span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/projects/${task.projectId}/board`);
                    }}
                    className="hint"
                  >
                    {projectName(task.projectId)}
                  </a>
                  {task.dueDate && (
                    <span className={isOverdue(task.dueDate) && !task.completedAt ? "my-task--overdue" : "hint"}>
                      <Icon name="calendar" size={13} /> {formatDate(task.dueDate, locale)}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="empty">
                <Icon name="kanban" size={28} />
                <p style={{ margin: 0 }}>{t("noMyTasks")}</p>
                <button className="btn" onClick={() => navigate("/projects")}>{t("goProjects")}</button>
              </li>
            )}
          </ul>
        </section>

        <aside className="workbench__side">
          <section className="card">
            <h2 className="section-title"><Icon name="brand" size={15} />{t("myProjects")}</h2>
            <ul className="side-project-list">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <button className="side-project" onClick={() => navigate(`/projects/${p.id}/board`)}>
                    <span>{p.name}</span>
                    <span className="badge">{p.openTaskCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <TaskDialog
        task={openTask}
        statusName={statusName}
        onClose={() => setOpenTask(null)}
      />
    </div>
  );
}
