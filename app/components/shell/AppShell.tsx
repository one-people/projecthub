import { useEffect, useState } from "react";
import { Outlet } from "@remix-run/react";
import { AppRail } from "./AppRail";
import { Breadcrumbs } from "./Breadcrumbs";
import { GlobalSearch } from "./GlobalSearch";
import { Icon } from "~/components/ui/Icon";
import { useI18n } from "~/lib/i18n";
import {
  getThemeMode,
  resolveTheme,
  setThemeMode,
  watchSystemTheme,
  type ResolvedTheme,
} from "~/lib/theme";

export function AppShell() {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getThemeMode()),
  );

  // 跟随系统时，系统切换深浅色要同步图标与令牌
  useEffect(() => watchSystemTheme(setTheme), []);

  function toggleTheme() {
    setTheme(setThemeMode(theme === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable) return;
      e.preventDefault();
      setSearchOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <AppRail onSearch={() => setSearchOpen(true)} />
      <div className="shell__main">
        <header className="topbar">
          <Breadcrumbs />
          <button
            className="topbar__search"
            onClick={() => setSearchOpen(true)}
            aria-label={t("globalSearch")}
          >
            <Icon name="search" size={14} />
            <span>{t("searchPlaceholder")}</span>
            <kbd aria-hidden>/</kbd>
          </button>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={t("themeToggle")}
            title={t("themeToggle")}
          >
            <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
          </button>
        </header>
        <div className="shell__content">
          <Outlet />
        </div>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
