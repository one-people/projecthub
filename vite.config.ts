import { vitePlugin as remix } from "@remix-run/dev";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    remix({
      // SPA 模式：无真实服务端，构建产物为纯静态资源
      ssr: false,
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "ProjectHub",
        short_name: "ProjectHub",
        description: "纯前端项目管理应用，数据存储于浏览器 IndexedDB",
        theme_color: "#3B82F6",
        background_color: "#ffffff",
        display: "standalone",
        lang: "zh-CN",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // SPA 兜底：未命中静态资源的导航请求回退到入口 HTML，离线可完整启动
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
    tsconfigPaths(),
  ],
});
