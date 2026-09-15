import { useState } from "react";
import { RichTextEditor, renderRichText } from "~/components/editor/RichTextEditor";
import type { Comment } from "~/models/comment";
import type { User } from "~/models/user";
import type { RoleId } from "~/auth/rbac";
import { formatRelative } from "~/lib/date";

export interface CommentListProps {
  comments: Comment[];
  users: User[];
  actorId: string;
  actorRole: RoleId;
  onAdd: (json: unknown) => Promise<void>;
}

export function CommentList({ comments, users, actorId, actorRole, onAdd }: CommentListProps) {
  const [draft, setDraft] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const user = (id: string) => users.find((u) => u.id === id);
  const name = (id: string) => user(id)?.name ?? "未知用户";

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
    <section aria-label="评论区" style={{ marginTop: 24 }}>
      <h3 className="section-title">评论（{comments.length}）</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {comments.map((c) => {
          const author = user(c.authorId);
          return (
            <li key={c.id} className="comment-item">
              <span
                className="avatar"
                style={{ background: author?.avatarColor ?? "#94A3B8" }}
                aria-hidden
              >
                {name(c.authorId).slice(0, 1)}
              </span>
              <div className="comment-body">
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13 }}>{name(c.authorId)}</strong>
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
        {comments.length === 0 && <li className="hint">暂无评论</li>}
      </ul>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16, marginTop: 12 }}>
        <p className="hint" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          以 {name(actorId)}（{actorRole}）身份评论
        </p>
        <RichTextEditor users={users.map(({ id, name }) => ({ id, name }))} content={null} onChange={setDraft} />
        <button
          className="btn btn--primary"
          onClick={submit}
          disabled={submitting || draft == null}
          style={{ marginTop: 8 }}
        >
          发表评论
        </button>
      </div>
    </section>
  );
}
