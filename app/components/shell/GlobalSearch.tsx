import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { isProjectVisible } from "~/auth/rbac";
import { Icon } from "~/components/ui/Icon";
import { useI18n } from "~/lib/i18n";
import type { Task } from "~/models/task";
import type { Project } from "~/models/project";

interface SearchResult {
  id: string;
  kind: "task" | "project";
  title: string;
  sub: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
      void (async () => {
        const [ts, ps, user] = await Promise.all([
          db.tasks.toArray(),
          db.projects.toArray(),
          session.currentUser(),
        ]);
        // 私有制：只搜索可见项目的项目名与其任务
        const visibleProjects = ps.filter((x) => isProjectVisible(x, user.id));
        const visibleIds = new Set(visibleProjects.map((p) => p.id));
        setTasks(ts.filter((x) => !x.deletedAt && visibleIds.has(x.projectId)));
        setProjects(visibleProjects);
      })();
    }
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [
      ...projects
        .filter((p) => p.name.toLowerCase().includes(q))
        .map((p) => ({ id: p.id, kind: "project" as const, title: p.name, sub: t("projects") })),
      ...tasks
        .filter((tk) => tk.title.toLowerCase().includes(q))
        .slice(0, 20)
        .map((tk) => ({
          id: tk.id,
          kind: "task" as const,
          title: tk.title,
          sub: projects.find((p) => p.id === tk.projectId)?.name ?? "",
        })),
    ];
  }, [query, projects, tasks, t]);

  if (!open) return null;

  function go(r: SearchResult) {
    onClose();
    if (r.kind === "project") navigate(`/projects/${r.id}/board`);
    else {
      const task = tasks.find((tk) => tk.id === r.id);
      if (task) navigate(`/projects/${task.projectId}/board#task=${r.id}`);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal search-modal" role="dialog" aria-modal="true" aria-label={t("globalSearch")}>
        <div className="search-modal__bar">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            className="input"
            style={{ flex: 1 }}
            value={query}
            placeholder={t("globalSearch")}
            aria-label={t("globalSearch")}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && results[active]) go(results[active]);
            }}
          />
        </div>
        <ul className="search-results" role="listbox">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.id}`}>
              <button
                role="option"
                aria-selected={i === active}
                className={`search-result${i === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
              >
                <Icon name={r.kind === "project" ? "kanban" : "check"} size={14} />
                <span className="search-result__title">{r.title}</span>
                <span className="hint">{r.sub}</span>
              </button>
            </li>
          ))}
          {query.trim() && results.length === 0 && (
            <li className="empty"><p>{t("noResults")}</p></li>
          )}
        </ul>
      </div>
    </div>
  );
}
