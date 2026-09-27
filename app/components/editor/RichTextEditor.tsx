import { useEditor, EditorContent, generateHTML } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { JSONContent } from "@tiptap/react";
import { useI18n } from "~/lib/i18n";

export interface RichTextEditorProps {
  users: { id: string; name: string }[];
  content?: JSONContent | null;
  onChange?: (json: JSONContent) => void;
}

export function editorExtensions() {
  return [StarterKit, Mention];
}

export function RichTextEditor({ users, content, onChange }: RichTextEditorProps) {
  const { t } = useI18n();
  const editor = useEditor({
    extensions: editorExtensions(),
    content: content ?? undefined,
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
  });

  function insertMention(userId: string, name: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "mention",
        attrs: { id: userId, label: name },
      })
      .insertContent(" ")
      .run();
  }

  return (
    <div>
      <div className="editor">
        <EditorContent editor={editor} />
      </div>
      <div className="mention-picker">
        <span className="hint" style={{ margin: 0 }}>{t("mentionHint")}</span>
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            className="mention-chip"
            onClick={() => insertMention(u.id, u.name)}
          >
            @{u.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function renderRichText(json: JSONContent | null): string {
  if (!json) return "";
  return generateHTML(json, editorExtensions());
}
