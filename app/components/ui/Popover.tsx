import { useEffect, useRef, type ReactNode } from "react";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 弹层对齐方向（相对锚点容器） */
  align?: "left" | "right";
  label?: string;
}

/** 通用锚定弹层：外部点击（mousedown）/ Escape 关闭，内部点击不关闭 */
export function Popover({ open, onClose, children, align = "left", label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`popover${align === "right" ? " popover--right" : ""}`}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  );
}
