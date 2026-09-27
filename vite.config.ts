import { vitePlugin as remix } from "@remix-run/dev";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// 部署子路径：GitHub Pages 项目页为 /<仓库名>/，本地开发默认根路径
const baseUrl = process.env.BASE_URL ?? "/";

export default defineConfig({
  base: baseUrl,
  plugins: [
    remix({
      // SPA 模式：无真实服务端，构建产物为纯静态资源
      ssr: false,
      basename: baseUrl,
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
          { src: `${baseUrl}icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: `${baseUrl}icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // SPA 兜底：未命中静态资源的导航请求回退到入口 HTML，离线可完整启动
        navigateFallback: `${baseUrl}index.html`,
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
    tsconfigPaths(),
  ],
});
