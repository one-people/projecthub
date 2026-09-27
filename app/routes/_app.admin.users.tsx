import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { userService, type UserFormInput } from "~/services/user.service";
import { formatDate } from "~/lib/date";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { useToast } from "~/components/ui/Toast";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import type { User } from "~/models/user";

export const handle = { crumb: () => ({ label: translate("userManage") }) };

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UsersRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [form, setForm] = useState<UserFormInput>({ name: "", email: "", avatarColor: COLORS[0]! });
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [pendingToggle, setPendingToggle] = useState<User | null>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [list, current, projects] = await Promise.all([
        userService.list(),
        session.currentUser(),
        db.projects.toArray(),
      ]);
      return { list, current, isAdmin: projects.some((p) => p.memberRoles[current.id] === "admin") };
    }).subscribe(({ list, current, isAdmin }) => {
      setUsers(list);
      setMe(current);
      setIsAdmin(isAdmin);
    });
    return () => sub.unsubscribe();
  }, []);

  if (!isAdmin && me) {
    return (
      <div className="empty">
        <Icon name="user" size={32} />
        <p style={{ margin: 0 }}>{t("forbidden")}</p>
      </div>
    );
  }

  function openEditor(user: User | "new") {
    setEditing(user);
    setNameError("");
    setEmailError("");
    setForm(
      user === "new"
        ? { name: "", email: "", avatarColor: COLORS[users.length % COLORS.length]! }
        : { name: user.name, email: user.email, avatarColor: user.avatarColor },
    );
  }

  function validateName() {
    const name = form.name.trim();
    if (!name) setNameError(t("errNameRequired"));
    else if (name.length > 50) setNameError(t("errNameTooLong"));
    else setNameError("");
  }

  function validateEmail() {
    const email = form.email.trim();
    if (email && !EMAIL_RE.test(email)) setEmailError(t("errEmailInvalid"));
    else setEmailError("");
  }

  async function submit() {
    if (!me || !editing) return;
    validateName();
    validateEmail();
    if (!form.name.trim() || form.name.trim().length > 50) return;
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) return;
    try {
      if (editing === "new") {
        await userService.create(me.id, "admin", form);
        toast.success(t("userCreated"));
      } else {
        await userService.update(me.id, "admin", editing.id, form);
        toast.success(t("userUpdated"));
      }
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    }
  }

  return (
    <div className="page-pad">
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("userManage")}</h1>
        <span className="page-toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => openEditor("new")}>
          <Icon name="plus" size={15} />
          {t("newUser")}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id} className="user-row">
              <span className="avatar" style={{ background: u.avatarColor, opacity: u.active ? 1 : 0.4 }}>
                {u.name.slice(0, 1)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{u.name}</strong>
                {u.id === me?.id && <span className="hint" style={{ marginLeft: 8 }}>({t("currentUser")})</span>}
                {u.email && <span className="hint" style={{ display: "block" }}>{u.email}</span>}
              </span>
              <span className="hint">{formatDate(u.createdAt, locale)}</span>
              <span className={`badge ${u.active ? "" : "badge--danger"}`}>
                {u.active ? t("userActive") : t("userDisabled")}
              </span>
              <button className="icon-btn" aria-label={t("edit")} onClick={() => openEditor(u)}>
                <Icon name="settings" size={15} />
              </button>
              <button
                className="btn"
                disabled={u.id === me?.id}
                title={u.id === me?.id ? t("cannotToggleSelf") : undefined}
                onClick={() => setPendingToggle(u)}
              >
                {u.active ? t("userDisable") : t("userEnable")}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={editing === "new" ? t("newUser") : t("editUser")}>
            <div className="modal__header">
              <h2 style={{ fontSize: 16, margin: 0 }}>{editing === "new" ? t("newUser") : t("editUser")}</h2>
              <button className="icon-btn" onClick={() => setEditing(null)} aria-label={t("close")}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              <label className="field-label">
                {t("userName")}
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={validateName}
                  aria-invalid={Boolean(nameError)}
                />
                {nameError && <span className="field-error" role="alert">{nameError}</span>}
              </label>
              <label className="field-label">
                {t("userEmail")}
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  onBlur={validateEmail}
                  aria-invalid={Boolean(emailError)}
                />
                {emailError && <span className="field-error" role="alert">{emailError}</span>}
              </label>
              <label className="field-label">
                {t("userAvatarColor")}
                <span style={{ display: "flex", gap: 8 }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot${form.avatarColor === c ? " is-selected" : ""}`}
                      style={{ background: c }}
                      aria-label={t("pickColorAria", { color: c })}
                      aria-pressed={form.avatarColor === c}
                      onClick={() => setForm((f) => ({ ...f, avatarColor: c }))}
                    />
                  ))}
                </span>
              </label>
            </div>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setEditing(null)}>{t("close")}</button>
              <button className="btn btn--primary" onClick={() => void submit()}>
                {editing === "new" ? t("newUser") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        title={pendingToggle?.active ? t("userDisable") : t("userEnable")}
        message={
          pendingToggle?.active
            ? t("confirmDisableUser", { name: pendingToggle?.name ?? "" })
            : t("confirmEnableUser", { name: pendingToggle?.name ?? "" })
        }
        onConfirm={async () => {
          if (!me || !pendingToggle) return;
          try {
            await userService.deactivate(me.id, "admin", pendingToggle.id);
            toast.success(pendingToggle.active ? t("userDisabledMsg") : t("userEnabledMsg"));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "error");
          }
          setPendingToggle(null);
        }}
        onCancel={() => setPendingToggle(null)}
      />

      <button className="btn" style={{ marginTop: 16 }} onClick={() => navigate("/admin/audit")}>
        <Icon name="list" size={15} />
        {t("auditLog")}
      </button>
    </div>
  );
}
