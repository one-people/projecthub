// 主题偏好：system（跟随系统）/ light / dark，存 localStorage，
// 解析结果落在 <html data-theme="light|dark"> 上供 CSS 使用
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = "themeMode";

export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

export function setThemeMode(mode: ThemeMode): ResolvedTheme {
  window.localStorage.setItem(KEY, mode);
  return applyTheme(mode);
}

/** 跟随系统时响应系统深浅色变化（返回清理函数） */
export function watchSystemTheme(
  onChange: (resolved: ResolvedTheme) => void,
): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange(applyTheme(getThemeMode()));
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/** 首帧内联脚本用：在 React 挂载前把 data-theme 写到 <html>，避免闪烁 */
export const THEME_INIT_SCRIPT =
  "(function(){try{var m=localStorage.getItem('themeMode');" +
  "var d=m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
  "document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();";
