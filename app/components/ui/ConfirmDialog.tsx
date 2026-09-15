import { useEffect, useRef, useState } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  confirmText?: string;
  /** 需要用户输入该文本才能确认（用于高危操作） */
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, danger, confirmText = "确认", requireText, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;
  const canConfirm = !requireText || typed === requireText;

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title} style={{ maxWidth: 400 }}>
        <div className="modal__header">
          <h2 style={{ fontSize: 16, margin: 0, color: danger ? "var(--color-danger)" : undefined }}>{title}</h2>
        </div>
        <p style={{ margin: "12px 0", color: "var(--color-text-secondary)" }}>{message}</p>
        {requireText && (
          <input
            ref={inputRef}
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`输入「${requireText}」以确认`}
            aria-label={`输入 ${requireText} 确认`}
            onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
          />
        )}
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel}>取消</button>
          <button
            className={`btn ${danger ? "btn--danger" : "btn--primary"}`}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
