// ESLint 扁平配置 — 规则依据 docs/standards/02-code-standards.md 与 03-component-standards.md
// 校验入口：npm run lint（聚合入口 npm run standards）
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "public/**",
      "node_modules/**",
      "coverage/**",
      ".github/**",
      "docs/**",
    ],
  },

  eslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,

  // 所有 TS 源码：类型感知规则（no-floating-promises 等对异步密集代码很关键）
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // —— React Hooks：经典两规则强制；v7 编译器新规则待存量清理后逐步引入 ——
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // autoFocus 用于「弹层/抽屉打开即聚焦首字段、内联快捷创建」，
      // 与交互规范 §5（焦点移入弹层）一致，属有意设计，豁免
      "jsx-a11y/no-autofocus": "off",

      // —— 代码规范 §1/§3：类型与命名 ——
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // ui/ 基础组件：与业务模型/服务完全解耦（docs/standards/03 §1）
  {
    files: ["app/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["~/models/*", "~/services/*", "~/repositories/*"],
              message: "ui/ 基础组件不得依赖 models/services/repositories（docs/standards/03 §1）。",
            },
          ],
        },
      ],
    },
  },

  // Node 侧脚本与构建配置：不参与 tsconfig projectService 的文件关闭类型感知
  {
    files: ["**/*.{mjs,cjs,js}"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
);
