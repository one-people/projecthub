import { useState } from "react";
import { RichTextEditor, renderRichText } from "~/components/editor/RichTextEditor";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import type { RoleId } from "~/auth/rbac";
import { formatRelative } from "~/lib/date";
import { t, useI18n } from "~/lib/i18n";
import { ROLE_LABEL_KEY } from "~/lib/role-labels";

export interface CommentListProps {
  comments: Comment[];
  users: User[];
  actorId: string;
  actorRole: RoleId;
  onAdd: (json: unknown) => Promise<void>;
  /** 抽屉内嵌时去掉外层卡片间距 */
  compact?: boolean;
  /** 无 comment:create 时隐藏输入框（访客只读） */
  canComment?: boolean;
}

export function CommentList({ comments, users, actorId, actorRole, onAdd, compact, canComment = true }: CommentListProps) {
  useI18n(); // 语言切换时重渲染
  const [draft, setDraft] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const user = (id: string) => users.find((u) => u.id === id);
  const name = (id: string) => user(id)?.name ?? t("unknownUser");

  async function submit() {
    if (draft == null) return;
    setSubmitting(true);
    try {
      await onAdd(draft);
      setDraft(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label={t("tabComments")} className={compact ? undefined : "comments-block"}>
      {!compact && <h3 className="section-title">{t("comments", { count: comments.length })}</h3>}
      <ul className="comment-list">
        {comments.map((c) => {
          const author = user(c.authorId);
          return (
            <li key={c.id} className="comment-item">
              <span
                className="avatar"
                style={{ background: author?.avatarColor ?? "var(--color-text-muted)" }}
                aria-hidden
              >
                {name(c.authorId).slice(0, 1)}
              </span>
              <div className="comment-body">
                <div className="comment-head">
                  <strong>{name(c.authorId)}</strong>
                  <span className="comment-meta">{formatRelative(c.createdAt)}</span>
                </div>
                <div
                  className="comment-body__rich"
                  dangerouslySetInnerHTML={{ __html: renderRichText(c.contentRich as never) }}
                />
              </div>
            </li>
          );
        })}
        {comments.length === 0 && <li className="hint">{t("noComments")}</li>}
      </ul>

      {canComment && (
        <div className="comment-form">
          <p className="hint comment-form__label">
            {t("commentAs", { name: name(actorId), role: t(ROLE_LABEL_KEY[actorRole]) })}
          </p>
          <RichTextEditor users={users.map(({ id, name }) => ({ id, name }))} content={null} onChange={setDraft} />
          <button
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={submitting || draft == null}
          >
            {t("postComment")}
          </button>
        </div>
      )}
    </section>
  );
}
