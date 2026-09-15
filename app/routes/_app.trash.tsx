import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { trashService } from "~/services/trash.service";
import { taskRepository } from "~/repositories/task.repository";
import { projectRepository } from "~/repositories/project.repository";
import { commentRepository } from "~/repositories/comment.repository";
import { formatRelative } from "~/lib/date";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";

export const handle = { crumb: () => ({ label: translate("trash") }) };

type Tab = "projects" | "tasks" | "comments";
const RETAIN_MS = 30 * 86400000;

interface TrashRow {
  id: string;
  label: string;
  deletedAt: string;
  blocked: boolean;
}

export default function TrashRoute() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("projects");
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof projectRepository.listDeleted>>>([]);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof taskRepository.listDeleted>>>([]);
  const [comments, setComments] = useState<Awaited<ReturnType<typeof commentRepository.listDeleted>>>([]);
  const [me, setMe] = useState<{ id: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [ps, ts, cs, user, allProjects] = await Promise.all([
        projectRepository.listDeleted(),
        taskRepository.listDeleted(),
        commentRepository.listDeleted(),
        session.currentUser(),
        db.projects.toArray(),
      ]);
      return {
        ps, ts, cs, user,
        isAdmin: allProjects.some((p) => p.memberRoles[user.id] === "admin"),
      };
    }).subscribe(({ ps, ts, cs, user, isAdmin }) => {
      setProjects(ps);
      setTasks(ts);
      setComments(cs);
      setMe({ id: user.id, isAdmin });
    });
    return () => sub.unsubscribe();
  }, []);

  const rows = useMemo<TrashRow[]>(() => {
    if (tab === "projects") {
      return projects.map((p) => ({ id: p.id, label: p.name, deletedAt: p.deletedAt!, blocked: false }));
    }
    if (tab === "tasks") {
      return tasks.map((tk) => ({
        id: tk.id,
        label: tk.title,
        deletedAt: tk.deletedAt!,
        blocked: tk.deletedByProjectId !== null,
      }));
    }
    return comments.map((c) => ({ id: c.id, label: `评论（${c.id.slice(0, 8)}）`, deletedAt: c.deletedAt!, blocked: false }));
  }, [tab, projects, tasks, comments]);

  async function restore(kind: Tab, id: string) {
    if (!me) return;
    if (kind === "projects") await trashService.restoreProject(me.id, "admin", id);
    if (kind === "tasks") await trashService.restoreTask(me.id, "member", id);
  }

  async function purge(kind: Tab, id: string) {
    if (!me || !confirm(t("confirmPurge"))) return;
    if (kind === "projects") await trashService.purgeProject(me.id, id);
    if (kind === "tasks") await trashService.purgeTask(me.id, id);
  }

  return (
    <div>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("trash")}</h1>
        <span className="page-toolbar__spacer" />
        <span className="hint">{t("trashHint")}</span>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <nav className="segmented" aria-label={t("trash")}>
          {(["projects", "tasks", "comments"] as Tab[]).map((k) => (
            <button
              key={k}
              className={`segmented__item${tab === k ? " segmented__item--active" : ""}`}
              onClick={() => setTab(k)}
            >
              {t(k === "projects" ? "tabProjects" : k === "tasks" ? "tabTasks" : "tabComments")}
            </button>
          ))}
        </nav>
        <ul className="trash-list">
          {rows.map((r) => {
            const remain = Math.max(
              0,
              Math.ceil((new Date(r.deletedAt).getTime() + RETAIN_MS - Date.now()) / 86400000),
            );
            return (
              <li key={r.id} className="trash-item">
                <span className="trash-item__label">{r.label}</span>
                <span className="hint">{t("deletedAtLabel")} {formatRelative(r.deletedAt)}</span>
                <span className="trash-item__retain">{t("retention")} {remain}d</span>
                <button
                  className="btn"
                  disabled={r.blocked}
                  title={r.blocked ? t("restoreWithProject") : undefined}
                  onClick={() => void restore(tab, r.id)}
                >
                  <Icon name="back" size={14} />
                  {t("restore")}
                </button>
                <button
                  className="btn btn--danger"
                  disabled={!me?.isAdmin}
                  title={!me?.isAdmin ? t("purgeForbidden") : undefined}
                  onClick={() => void purge(tab, r.id)}
                >
                  <Icon name="trash" size={14} />
                  {t("purge")}
                </button>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="empty">
              <Icon name="trash" size={28} />
              <p style={{ margin: 0 }}>{t("trashEmpty")}</p>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
