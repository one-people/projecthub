import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { backupService } from "~/services/backup.service";
import { userService } from "~/services/user.service";
import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { generateKeyBetween } from "~/lib/fractional-index";
import { useI18n, t as translate } from "~/lib/i18n";
import { setThemeMode, type ThemeMode } from "~/lib/theme";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { User } from "~/models/user";
import type { Project } from "~/models/project";

export const handle = { crumb: () => ({ label: translate("settings") }) };
import { Icon } from "~/components/ui/Icon";

export default function SettingsRoute() {
  const { t, locale, setLocale } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState<string>("");
  const [hasProject, setHasProject] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [newUserName, setNewUserName] = useState("");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [rows, projectRows, pref] = await Promise.all([
        db.users.toArray(),
        db.projects.toArray(),
        db.preferences.get("currentUserId"),
      ]);
      return { rows, projectRows, meId: pref?.value ?? "" };
    }).subscribe(({ rows, projectRows, meId: current }) => {
      setUsers(rows);
      setProjects(projectRows.filter((p) => !p.deletedAt));
      setMeId(typeof current === "string" ? current : "");
    });
    return () => sub.unsubscribe();
  }, []);

  async function addUser() {
    const name = newUserName.trim();
    if (!name) return;
    try {
      await userService.create(name);
      setNewUserName("");
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  async function deleteUser() {
    if (!pendingDeleteUser) return;
    try {
      await userService.remove(pendingDeleteUser.id);
      setPendingDeleteUser(null);
      toast.success(t("deleted"));
    } catch (e) {
      setPendingDeleteUser(null);
      toast.error(e instanceof Error ? e.message : t("updateFailed"));
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("themeMode");
    setThemeModeState(
      saved === "light" || saved === "dark" ? saved : "system",
    );
  }, []);

  function changeTheme(mode: ThemeMode) {
    setThemeModeState(mode);
    setThemeMode(mode);
  }

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
        startDate: null,
        dueDate: null,
        customValues: {},
        priority: priorities[i % 5]!,
        labels: [],
        subtasks: [],
        recurrence: "none" as const,
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
            <Icon name="user" size={16} />
            {t("userManagement")}
          </h2>
          <p className="hint">{t("userManagementHint")}</p>
          <ul className="user-list" style={{ marginBottom: 12 }}>
            {users.map((u) => {
              const owned = projects.filter((p) => p.ownerId === u.id).length;
              const memberOf = projects.filter(
                (p) => p.ownerId !== u.id && p.memberRoles[u.id],
              ).length;
              const isMe = u.id === meId;
              return (
                <li key={u.id} className="user-row">
                  <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {u.name}
                    {isMe && <span className="hint">{t("itsYou")}</span>}
                  </span>
                  {owned > 0 && <span className="badge badge--role">{t("ownsProjectsCount", { count: owned })}</span>}
                  {memberOf > 0 && <span className="badge">{t("memberProjectsCount", { count: memberOf })}</span>}
                  <span style={{ flex: 1 }} />
                  <button
                    className="btn btn--danger"
                    onClick={() => setPendingDeleteUser(u)}
                    aria-label={t("deleteUserAria", { name: u.name })}
                  >
                    <Icon name="trash" size={14} />{t("actionDelete")}
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              void addUser();
            }}
          >
            <input
              className="input"
              style={{ maxWidth: 280 }}
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder={t("newUserNamePlaceholder")}
              aria-label={t("newUserNamePlaceholder")}
            />
            <button type="submit" className="btn btn--primary" disabled={!newUserName.trim()}>
              <Icon name="plus" size={15} />{t("addUser")}
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="sun" size={16} />
            {t("appearance")}
          </h2>
          <div className="segmented" role="group" aria-label={t("appearance")}>
            {(
              [
                { value: "system", label: t("themeSystem"), icon: "panel" },
                { value: "light", label: t("themeLight"), icon: "sun" },
                { value: "dark", label: t("themeDark"), icon: "moon" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={
                  themeMode === opt.value
                    ? "segmented__item segmented__item--active"
                    : "segmented__item"
                }
                aria-pressed={themeMode === opt.value}
                onClick={() => changeTheme(opt.value)}
              >
                <Icon name={opt.icon} size={14} />
                {opt.label}
              </button>
            ))}
          </div>
        </section>

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

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title={t("deleteUserAria", { name: pendingDeleteUser?.name ?? "" })}
        message={t("confirmDeleteUser", { name: pendingDeleteUser?.name ?? "" })}
        danger
        onConfirm={() => void deleteUser()}
        onCancel={() => setPendingDeleteUser(null)}
      />
    </div>
  );
}
