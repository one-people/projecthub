import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import { useEffect } from "react";
import { initLocale } from "~/lib/i18n";
import { applyTheme, getThemeMode, THEME_INIT_SCRIPT } from "~/lib/theme";
import { trashService } from "~/services/trash.service";
import { ToastProvider } from "~/components/ui/Toast";
import "./styles/global.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* 首帧前解析主题偏好，避免深色模式闪白 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => {
    applyTheme(getThemeMode());
    void initLocale();
    void trashService.purgeExpired();
  }, []);
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "未知错误";
  return (
    <div className="error-shell">
      <h1>出错了</h1>
      <p>{message}</p>
    </div>
  );
}
