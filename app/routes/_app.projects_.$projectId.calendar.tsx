import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "@remix-run/react";
import { liveQuery } from "dexie";
import { Icon } from "~/components/ui/Icon";
import { CalendarView } from "~/components/calendar/CalendarView";
import { TaskDrawer } from "~/components/task/TaskDrawer";
import { taskService, PermissionError } from "~/services/task.service";
import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { buildMonthGrid, dateKey, isoToDateKey, localMidnightIso } from "~/lib/calendar";
import type { Task } from "~/models/task";
import { t as translate, useI18n } from "~/lib/i18n";
import { can } from "~/auth/rbac";
import { useToast } from "~/components/ui/Toast";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("calendarView") }) };

const WEEKDAY_KEYS = ["calMon", "calTue", "calWed", "calThu", "calFri", "calSat", "calSun"] as const;

export default function CalendarRoute() {
  const { project, role, actorId } = useOutletContext<ProjectOutletContext>();
  const toast = useToast();
  const { t, locale } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  useEffect(() => {
    const sub = liveQuery(() =>
      db.tasks.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setTasks(rows));
    return () => sub.unsubscribe();
  }, [project.id]);

  const canEdit = can(role, "task:update");
  const canCreate = can(role, "task:create");

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const todayKey = dateKey(new Date());
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
    }).format(new Date(cursor.year, cursor.month, 1)),
    [cursor, locale],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = isoToDateKey(task.dueDate);
      const list = map.get(key);
      if (list) list.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((tk) => !tk.dueDate), [tasks]);

  const openTask = openTaskId ? tasks.find((tk) => tk.id === openTaskId) ?? null : null;

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function guard(e: unknown) {
    if (e instanceof PermissionError) {
      toast.error(e.message);
      return true;
    }
    return false;
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    try {
      await taskService.updateTask(actorId, taskId, patch);
    } catch (e) {
      guard(e);
    }
  }

  async function createOnDay(title: string, dayKey: string) {
    const firstColumn = project.statusColumns.find((c) => c.order === 0);
    if (!firstColumn) return;
    try {
      await taskService.create(actorId, {
        id: uuid(),
        projectId: project.id,
        title,
        status: firstColumn.id,
        dueDate: localMidnightIso(dayKey),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("createFailed"));
    }
  }

  return (
    <div className="cal-page">
      <div className="cal-toolbar">
        <div className="cal-toolbar__nav">
          <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label={t("prevMonth")}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label={t("nextMonth")}>
            <Icon name="chevronRight" size={16} />
          </button>
          <button type="button" className="btn" onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>
            {t("calToday")}
          </button>
        </div>
        <h2 className="cal-toolbar__title">{monthTitle}</h2>
        <span className="cal-toolbar__spacer" />
        <span className="cal-toolbar__count">{t("taskCountLabel", { count: tasks.length })}</span>
      </div>
      <CalendarView
        days={days}
        tasksByDay={tasksByDay}
        unscheduled={unscheduled}
        todayKey={todayKey}
        weekdayLabels={WEEKDAY_KEYS.map((k) => t(k))}
        canEdit={canEdit}
        canCreate={canCreate}
        onOpenTask={(task) => setOpenTaskId(task.id)}
        onPatch={(id, patch) => void patchTask(id, patch)}
        onCreate={(title, dayKey) => void createOnDay(title, dayKey)}
      />
      <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} onOpenTask={setOpenTaskId} />
    </div>
  );
}
