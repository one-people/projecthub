# ProjectHub 开发规范（Standards）

本目录是 ProjectHub 的**唯一规范来源**，所有代码（包括 AI 生成的代码）必须遵循。规范与工具链联动，多数规则可通过 `npm run standards` 自动校验。

## 规范文档索引

| 文档 | 内容 | 主要约束对象 |
| --- | --- | --- |
| [01-ui-spec.md](./01-ui-spec.md) | UI 规范：设计 Token、颜色、字体、间距、圆角、阴影、暗色模式、图标 | `app/styles/tokens.css`、所有样式 |
| [02-code-standards.md](./02-code-standards.md) | 代码规范：TypeScript、命名、分层架构、导入、注释、测试 | `app/**/*.ts(x)` |
| [03-component-standards.md](./03-component-standards.md) | 组件规范：组件结构、Props、命名、样式类名、基础组件 | `app/components/**`、`app/routes/**` |
| [04-interaction-spec.md](./04-interaction-spec.md) | 页面交互规范：导航、表单、反馈、状态页、键盘与无障碍、动效 | 所有用户可见行为 |

## 项目级样式配置

- **`app/styles/tokens.css`** —— 设计 Token 单一事实来源（颜色 / 间距 / 圆角 / 阴影 / 字体 / 动效）。
- **`app/styles/global.css`** —— 基础样式 + 组件样式；只消费 Token，不定义全局 Token、不出现硬编码色值。

## 规范校验（CI 与本地一致）

```bash
npm run standards      # 一键执行全部规范校验（类型 + ESLint + Stylelint + 项目规则）
npm run typecheck      # TypeScript 严格类型检查
npm run lint           # ESLint（TS / React Hooks / a11y）
npm run lint:css       # Stylelint（样式 + Token 纪律）
npm run check:standards # 项目级结构规则（scripts/check-standards.mjs）
npm test               # Vitest 单元测试
```

任何 PR 在合并前必须保证 `npm run standards` 与 `npm test` 全部通过。

## 规范变更流程

1. 在对应文档中修改规则，并在 PR 中说明动机。
2. 同步更新校验工具（ESLint / Stylelint / `scripts/check-standards.mjs`）配置。
3. 全量执行 `npm run standards`，修复存量违规后方可合并。
