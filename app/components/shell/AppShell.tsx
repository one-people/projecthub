import { useEffect, useState } from "react";
import { Outlet } from "@remix-run/react";
import { AppRail } from "./AppRail";
import { ContextPanel } from "./ContextPanel";
import { Breadcrumbs } from "./Breadcrumbs";
import { GlobalSearch } from "./GlobalSearch";
import { Icon } from "~/components/ui/Icon";
import { useI18n } from "~/lib/i18n";

const PANEL_KEY = "panelOpen";

function initialPanel(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(PANEL_KEY);
  if (saved === "0") return false;
  if (saved === "1") return true;
  return window.innerWidth >= 900;
}

export function AppShell() {
  const { t } = useI18n();
  const [panelOpen, setPanelOpen] = useState(initialPanel);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0");
  }, [panelOpen]);

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
      {panelOpen && <ContextPanel />}
      <div className="shell__main">
        <header className="topbar">
          <button
            className="icon-btn"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={t("togglePanel")}
            title={t("togglePanel")}
            aria-expanded={panelOpen}
          >
            <Icon name="panel" size={16} />
          </button>
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
        </header>
        <div className="shell__content">
          <Outlet />
        </div>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
