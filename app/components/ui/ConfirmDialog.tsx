import { useEffect, useRef, useState } from "react";
import { useI18n } from "~/lib/i18n";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  confirmText?: string;
  /** 需要用户输入该文本才能确认（用于高危操作） */
  requireText?: string;
  /** 确认回调允许异步（删除等操作直调 service） */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, danger, confirmText, requireText, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
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
      <div className="modal modal--sm" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <h2 className={danger ? "modal__title--danger" : undefined}>{title}</h2>
        </div>
        <p className="modal__message">{message}</p>
        {requireText && (
          <input
            ref={inputRef}
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("typeToConfirmHint", { text: requireText })}
            aria-label={`${requireText}`}
            onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
          />
        )}
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel}>{t("cancel")}</button>
          <button
            className={`btn ${danger ? "btn--danger" : "btn--primary"}`}
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
          >
            {confirmText ?? t("confirmOk")}
          </button>
        </div>
      </div>
    </div>
  );
}
