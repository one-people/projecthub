import { useEffect, useState } from "react";
import { Outlet, useLocation, useMatches } from "@remix-run/react";
import { AppRail } from "./AppRail";
import { ContextPanel } from "./ContextPanel";
import { ProjectPanel } from "./ProjectPanel";
import { PanelOpenContext } from "./panel-context";
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

const PANEL_KEY = "panelOpen";

/** 独立页标记：与项目无关的路由（用户、设置），中间面板整块隐藏 */
type SoloHandle = { solo?: boolean };

function initialPanel(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(PANEL_KEY);
  if (saved === "0") return false;
  if (saved === "1") return true;
  return window.innerWidth >= 900;
}

export function AppShell() {
  const { t } = useI18n();
  const matches = useMatches();
  const location = useLocation();
  const [panelOpen, setPanelOpen] = useState(initialPanel);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getThemeMode()),
  );

  // 面板内容随路由分流：项目空间内显示本项目视图，其余显示项目列表
  const projectId = matches.find((m) => m.params.projectId)?.params.projectId;
  const soloPage = matches.some((m) => (m.handle as SoloHandle | undefined)?.solo === true);
  const panelVisible = !soloPage;

  useEffect(() => {
    window.localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0");
  }, [panelOpen]);

  // 窄屏下面板是浮层，路由切换后自动收起，避免一直盖住内容
  useEffect(() => {
    if (window.innerWidth < 900) setPanelOpen(false);
  }, [location.pathname]);

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
    <PanelOpenContext.Provider value={panelVisible && panelOpen}>
      <div className="shell">
        <AppRail onSearch={() => setSearchOpen(true)} />
        {panelVisible &&
          panelOpen &&
          (projectId ? <ProjectPanel projectId={projectId} /> : <ContextPanel />)}
        <div className="shell__main">
          <header className="topbar">
            {panelVisible && (
              <button
                className="icon-btn"
                onClick={() => setPanelOpen((v) => !v)}
                aria-label={t("togglePanel")}
                title={t("togglePanel")}
                aria-expanded={panelOpen}
              >
                <Icon name="panel" size={16} />
              </button>
            )}
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
    </PanelOpenContext.Provider>
  );
}
