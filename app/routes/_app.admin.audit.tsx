import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { auditService } from "~/services/audit.service";
import { formatRelative } from "~/lib/date";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import type { AuditAction, AuditLog } from "~/models/auditLog";
import type { User } from "~/models/user";

export const handle = { crumb: () => ({ label: translate("auditLog") }) };

const PAGE_SIZE = 50;
const ACTIONS: AuditAction[] = ["create", "update", "delete", "restore", "purge"];
const ENTITY_TYPES: AuditLog["entityType"][] = ["task", "project", "comment", "user"];

const ACTION_CLASS: Record<AuditAction, string> = {
  create: "badge--success",
  update: "badge--info",
  delete: "badge--danger",
  restore: "badge--accent",
  purge: "badge--danger",
};

export default function AuditRoute() {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState<"" | AuditAction>("");
  const [entityType, setEntityType] = useState<"" | AuditLog["entityType"]>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const limit = 1000; // 本地演示量级足够
      const rows = await auditService.list({
        limit,
        actorId: actorId || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
      });
      const us = await db.users.toArray();
      return { rows, us };
    }).subscribe(({ rows, us }) => {
      setLogs(rows);
      setUsers(us);
    });
    return () => sub.unsubscribe();
  }, [actorId, action, entityType]);

  const pageCount = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = logs.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const actorName = (id: string) =>
    id === "system" ? "系统" : users.find((u) => u.id === id)?.name ?? id;
  const actorColor = (id: string) =>
    users.find((u) => u.id === id)?.avatarColor ?? "#94A3B8";

  return (
    <div>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("auditTitle")}</h1>
        <span className="page-toolbar__spacer" />
        <select className="input" value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }} aria-label={t("filterActor")}>
          <option value="">{t("filterActor")}：{t("all")}</option>
          <option value="system">系统</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="input" value={action} onChange={(e) => { setAction(e.target.value as "" | AuditAction); setPage(1); }} aria-label={t("filterAction")}>
          <option value="">{t("filterAction")}：{t("all")}</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{t(`action${a[0]!.toUpperCase()}${a.slice(1)}` as never)}</option>)}
        </select>
        <select className="input" value={entityType} onChange={(e) => { setEntityType(e.target.value as "" | AuditLog["entityType"]); setPage(1); }} aria-label={t("filterEntityType")}>
          <option value="">{t("filterEntityType")}：{t("all")}</option>
          {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <ul className="audit-list">
          {rows.map((log) => (
            <li key={log.id} className="audit-item">
              <span className="avatar" style={{ background: actorColor(log.actorId) }} aria-hidden>
                {actorName(log.actorId).slice(0, 1)}
              </span>
              <span className={`badge ${ACTION_CLASS[log.action]}`}>
                {t(`action${log.action[0]!.toUpperCase()}${log.action.slice(1)}` as never)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{log.summary}</span>
              <span className="hint">{actorName(log.actorId)}</span>
              <span className="hint" style={{ minWidth: 90, textAlign: "right" }}>
                {formatRelative(log.createdAt, locale)}
              </span>
            </li>
          ))}
        </ul>
        <div className="audit-pagination">
          <button className="btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            <Icon name="back" size={14} />{t("prevPage")}
          </button>
          <span className="hint">{t("pageOf", { page: `${current}/${pageCount}` })}</span>
          <button className="btn" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            {t("nextPage")}
          </button>
        </div>
      </div>
    </div>
  );
}
