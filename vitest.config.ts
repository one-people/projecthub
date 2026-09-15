import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 各文件共享 fake-indexeddb 单例，需顺序执行避免跨文件竞态
    fileParallelism: false,
  },
});
