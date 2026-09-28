import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { workbenchService, type WorkbenchData } from "~/services/workbench.service";
import { PRIORITY_META, PRIORITY_LABEL_KEY } from "~/lib/priority";
import { formatDate, isOverdue } from "~/lib/date";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { TaskDrawer } from "~/components/task/TaskDrawer";
import type { Task } from "~/models/task";

type Tab = "pending" | "today" | "overdue" | "recent";

export const handle = { crumb: () => ({ label: translate("workbench") }) };

export default function WorkbenchRoute() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const user = await session.currentUser();
      setMe({ id: user.id, name: user.name });
      const sub = liveQuery(() => workbenchService.load(user.id)).subscribe(setData);
      unsub = () => sub.unsubscribe();
    })();
    const sub2 = liveQuery(() => db.projects.toArray()).subscribe((rows) => {
      setProjectNames(
        new Map(rows.filter((p) => p.deletedAt === null).map((p) => [p.id, p.name])),
      );
    });
    return () => {
      unsub?.();
      sub2.unsubscribe();
    };
  }, []);

  // 抽屉内实时跟踪任务变更（字段编辑/完成/删除后自动同步或关闭）
  useEffect(() => {
    if (!openTaskId) {
      setOpenTask(null);
      return;
    }
    const sub = liveQuery(() => db.tasks.get(openTaskId)).subscribe((task) => {
      if (!task || task.deletedAt) setOpenTaskId(null);
      else setOpenTask(task);
    });
    return () => sub.unsubscribe();
  }, [openTaskId]);

  if (!data) {
    return <div className="page-pad"><div className="skeleton" style={{ height: 120 }} /></div>;
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

  return (
    <div className="page-pad workbench">
      <div className="workbench__hero">
        <h1 className="workbench__greet">
          {greet}{me ? `，${me.name}` : ""}
        </h1>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-card__value">{data.pending.length}</span>
          <span className="stat-card__label">{t("openCount")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{data.today.length}</span>
          <span className="stat-card__label">{t("todayDue")}</span>
        </div>
        <div className="stat-card stat-card--danger">
          <span className="stat-card__value">{data.overdue.length}</span>
          <span className="stat-card__label">{t("overdueCount")}</span>
        </div>
        <div className="stat-card stat-card--done">
          <span className="stat-card__value">{data.weekDone}</span>
          <span className="stat-card__label">{t("weekDone")}</span>
        </div>
      </div>

      <div className="workbench__body">
        <section className="card" aria-label={t("myTasks")}>
          <nav className="tabs workbench__tabs" aria-label={t("myTasks")}>
            {(Object.keys(groups) as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`tabs__item${tab === k ? " is-active" : ""}`}
                onClick={() => setTab(k)}
              >
                {groups[k]}
                <span className="tabs__count">{data[k].length}</span>
              </button>
            ))}
          </nav>
          <ul className="my-task-list">
            {rows.map((task) => (
              <li key={task.id}>
                <button className="my-task" onClick={() => setOpenTaskId(task.id)}>
                  <span
                    className="prio__dot"
                    style={{ background: PRIORITY_META[task.priority].color }}
                    title={t(PRIORITY_LABEL_KEY[task.priority])}
                  />
                  <span className={`my-task__title${task.completedAt ? " my-task__title--done" : ""}`}>
                    {task.title}
                  </span>
                  {projectNames.get(task.projectId) && (
                    <span className="my-task__project">{projectNames.get(task.projectId)}</span>
                  )}
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

      <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} onOpenTask={setOpenTaskId} />
    </div>
  );
}
