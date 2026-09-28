import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "@remix-run/react";
import { liveQuery } from "dexie";
import { TimelineView, type TimelineZoom } from "~/components/timeline/TimelineView";
import { TaskDrawer } from "~/components/task/TaskDrawer";
import { db } from "~/repositories/db";
import type { Task } from "~/models/task";
import type { TaskLink } from "~/models/taskLink";
import { t as translate, useI18n } from "~/lib/i18n";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("timelineView") }) };

const ZOOMS: TimelineZoom[] = ["day", "week", "month"];
const ZOOM_KEY = { day: "zoomDay", week: "zoomWeek", month: "zoomMonth" } as const;

export default function TimelineRoute() {
  const { project } = useOutletContext<ProjectOutletContext>();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<TimelineZoom>("week");

  useEffect(() => {
    const prefKey = `timelineZoom:${project.id}`;
    void db.preferences.get(prefKey).then((row) => {
      const v = row?.value as TimelineZoom | undefined;
      if (v && ZOOMS.includes(v)) setZoom(v);
    });
  }, [project.id]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.tasks.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setTasks(rows.filter((r) => r.deletedAt === null)));
    return () => sub.unsubscribe();
  }, [project.id]);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.taskLinks.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setLinks(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  const openTask = openTaskId ? tasks.find((tk) => tk.id === openTaskId) ?? null : null;

  function changeZoom(z: TimelineZoom) {
    setZoom(z);
    void db.preferences.put({ key: `timelineZoom:${project.id}`, value: z });
  }

  return (
    <div className="tl-page">
      <div className="tl-toolbar">
        <div className="tl-toolbar__zoom" role="group" aria-label={t("timelineView")}>
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              className={`tl-toolbar__zoom-btn${zoom === z ? " is-active" : ""}`}
              onClick={() => changeZoom(z)}
              aria-pressed={zoom === z}
            >
              {t(ZOOM_KEY[z])}
            </button>
          ))}
        </div>
        <span className="tl-toolbar__spacer" />
        <span className="tl-toolbar__count">{t("taskCountLabel", { count: tasks.length })}</span>
      </div>
      <TimelineView tasks={tasks} links={links} zoom={zoom} onOpenTask={(tk) => setOpenTaskId(tk.id)} />
      <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} onOpenTask={setOpenTaskId} />
    </div>
  );
}
