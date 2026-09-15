import { useEffect, useState } from "react";
import { Outlet } from "@remix-run/react";
import { Sidebar } from "./Sidebar";
import { Breadcrumbs } from "./Breadcrumbs";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="shell__main">
        <header className="topbar">
          <Breadcrumbs />
        </header>
        <div className="shell__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
