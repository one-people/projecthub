import { useEffect, useRef, useState } from "react";
import { backupService } from "~/services/backup.service";
import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { generateKeyBetween } from "~/lib/fractional-index";
import { useI18n, t as translate } from "~/lib/i18n";

export const handle = { crumb: () => ({ label: translate("settings") }) };
import { Icon } from "~/components/ui/Icon";

export default function SettingsRoute() {
  const { t, locale, setLocale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState<string>("");
  const [hasProject, setHasProject] = useState(false);

  useEffect(() => {
    void (async () => {
      const count = await db.projects.count();
      setHasProject(count > 0);
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setUsage(`${((est.usage ?? 0) / 1024 / 1024).toFixed(2)} MB`);
      }
    })();
  }, []);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imported } = await backupService.importAll(await file.text());
      setMessage(t("importSuccess", { count: imported }));
    } catch (err) {
      setMessage(t("importFailed", { message: err instanceof Error ? err.message : "invalid" }));
    }
    e.target.value = "";
  }

  async function seedStressTasks() {
    const project = await db.projects.toCollection().first();
    if (!project) return;
    const firstColumn = project.statusColumns.find((c) => c.order === 0);
    if (!firstColumn) return;
    const now = new Date().toISOString();
    const priorities = ["urgent", "high", "medium", "low", "none"] as const;
    let prev: string | null = null;
    const rows = Array.from({ length: 200 }, (_, i) => {
      const order = generateKeyBetween(prev, null);
      prev = order;
      return {
        id: uuid(),
        projectId: project.id,
        title: `压测任务 ${i + 1}`,
        descriptionRich: null,
        status: firstColumn.id,
        assigneeId: null,
        dueDate: null,
        priority: priorities[i % 5]!,
        labels: [],
        subtasks: [],
        order,
        archived: false,
        completedAt: null,
        deletedAt: null,
        deletedByProjectId: null,
        createdAt: now,
        updatedAt: now,
        version: 0,
      };
    });
    await db.tasks.bulkAdd(rows);
    setMessage(t("stressDone", { count: rows.length }));
  }

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("settings")}</h1>
      </div>

      <div className="stack">
        <section className="card">
          <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="settings" size={16} />
            {t("language")}
          </h2>
          <select
            className="input"
            value={locale}
            onChange={(e) => void setLocale(e.target.value as "zh-CN" | "en")}
            aria-label={t("language")}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </section>

        <section className="card">
          <h2 className="section-title">{t("backup")}</h2>
          <p className="hint">{t("backupHint", { usage: usage || "…" })}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--primary" onClick={() => void backupService.downloadBackup()}>
              <Icon name="download" size={15} />
              {t("exportBackup")}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={15} />
              {t("importBackup")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={onImport}
              style={{ display: "none" }}
              aria-label={t("backupFileAria")}
            />
          </div>
          {message && (
            <p role="status" style={{ marginTop: 12, color: "var(--color-text-secondary)", marginBottom: 0 }}>
              {message}
            </p>
          )}
        </section>

        <section className="card">
          <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="zap" size={16} />
            {t("devTools")}
          </h2>
          <button className="btn" onClick={seedStressTasks} disabled={!hasProject}>
            {t("stressTasks")}
          </button>
        </section>
      </div>
    </div>
  );
}
