import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { flowService } from "~/services/flow.service";
import { t as translate, useI18n } from "~/lib/i18n";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Icon } from "~/components/ui/Icon";
import { flowSchema, type Flow } from "~/models/flow";

export const handle = { crumb: () => ({ label: translate("flowsMenu") }) };

/** 流程图模块首页：全部流程图文档（最近编辑优先），支持新建/重命名/删除 */
export default function FlowsRoute() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<Flow[] | null>(null); // null = 加载中
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Flow | null>(null);
  const [renameText, setRenameText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Flow | null>(null);

  useEffect(() => {
    // 经 schema 归一化（补默认值），按更新时间倒序：最近编辑优先
    const sub = liveQuery(async () => {
      const rows = await db.flows.toArray();
      return rows
        .map((r) => flowSchema.parse(r))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    }).subscribe(setFlows);
    return () => sub.unsubscribe();
  }, []);

  async function createFlow() {
    const name = newName.trim();
    if (!name) return;
    try {
      const flow = await flowService.create(name);
      setNewName("");
      navigate(`/flows/${flow.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function saveRename() {
    if (!renaming) return;
    try {
      await flowService.rename(renaming.id, renameText);
      setRenaming(null);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteFlow() {
    if (!pendingDelete) return;
    try {
      await flowService.remove(pendingDelete.id);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
    setPendingDelete(null);
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1>{t("flowsMenu")}</h1>
        <span className="hint">{t("flowsCount", { count: flows?.length ?? 0 })}</span>
        <span className="page-toolbar__spacer" />
        <form
          className="flows-create"
          onSubmit={(e) => {
            e.preventDefault();
            void createFlow();
          }}
        >
          <input
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("newFlowNamePlaceholder")}
            aria-label={t("newFlowNamePlaceholder")}
            maxLength={200}
          />
          <button type="submit" className="btn btn--primary" disabled={!newName.trim()}>
            <Icon name="plus" size={15} />{t("createFlow")}
          </button>
        </form>
      </div>

      {flows === null ? (
        <p className="empty">{t("loading")}</p>
      ) : flows.length === 0 ? (
        <div className="flows-empty card">
          <Icon name="workflow" size={28} />
          <p>{t("flowsEmptyHint")}</p>
        </div>
      ) : (
        <ul className="flows-grid">
          {flows.map((f) => (
            <li key={f.id} className="flows-card card">
              <button
                type="button"
                className="flows-card__open"
                onClick={() => navigate(`/flows/${f.id}`)}
                aria-label={t("openFlowAria", { name: f.name })}
              >
                <span className="flows-card__diagram">
                  <Icon name="workflow" size={22} />
                </span>
                <span className="flows-card__name" title={f.name}>{f.name}</span>
                <span className="hint">
                  {t("flowNodeCount", { n: f.nodes.length })} · {fmt(f.updatedAt)}
                </span>
              </button>
              <span className="flows-card__actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("renameFlowAria", { name: f.name })}
                  title={t("renameFlow")}
                  onClick={() => {
                    setRenaming(f);
                    setRenameText(f.name);
                  }}
                >
                  <Icon name="pencil" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={t("deleteFlowAria", { name: f.name })}
                  title={t("actionDelete")}
                  onClick={() => setPendingDelete(f)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {renaming && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setRenaming(null); }}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("renameFlow")}
            onSubmit={(e) => {
              e.preventDefault();
              void saveRename();
            }}
          >
            <div className="modal__header">
              <h2>{t("renameFlow")}</h2>
              <button type="button" className="icon-btn" aria-label={t("close")} onClick={() => setRenaming(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <label className="field-label form-field">
              {t("flowNameLabel")}
              <input
                className="input"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                placeholder={t("flowNameLabel")}
                autoFocus
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void saveRename(); }
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            </label>
            <div className="confirm-actions">
              <button type="button" className="btn" onClick={() => setRenaming(null)}>{t("cancel")}</button>
              <button type="submit" className="btn btn--primary" disabled={!renameText.trim()}>
                {t("save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("deleteFlowAria", { name: pendingDelete?.name ?? "" })}
        message={t("confirmDeleteFlow", { name: pendingDelete?.name ?? "" })}
        danger
        onConfirm={() => void deleteFlow()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
