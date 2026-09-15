import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface ToastOptions {
  undo?: () => void | Promise<void>;
  retry?: () => void | Promise<void>;
}

interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
  options: ToastOptions;
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const SUCCESS_MS = 3000;
const UNDO_MS = 10000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastItem["kind"], message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, kind, message, options }]);
      if (kind === "success") {
        setTimeout(() => remove(id), options.undo ? UNDO_MS : SUCCESS_MS);
      }
    },
    [remove],
  );

  const api = useRef<ToastApi>({
    success: (m, o) => push("success", m, o),
    error: (m, o) => push("error", m, o),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <Icon name={t.kind === "success" ? "check" : "close"} size={15} />
            <span className="toast__msg">{t.message}</span>
            {t.options.undo && (
              <button
                className="toast__action"
                onClick={() => {
                  void t.options.undo?.();
                  remove(t.id);
                }}
              >
                撤销
              </button>
            )}
            {t.options.retry && (
              <button
                className="toast__action"
                onClick={() => {
                  void t.options.retry?.();
                  remove(t.id);
                }}
              >
                重试
              </button>
            )}
            <button className="toast__close" onClick={() => remove(t.id)} aria-label="关闭提示">
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
