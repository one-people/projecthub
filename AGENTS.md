# AGENTS.md — ProjectHub 开发约束

ProjectHub：Remix 2 + React 18 + TS 的纯前端项目管理应用，数据全存浏览器 IndexedDB。完整规范见 **`docs/standards/`**（写代码前必读索引 `docs/standards/README.md`）。

## 最高优先级规则（违反即打回）

1. **样式**：设计 Token 只在 `app/styles/tokens.css` 定义；其余样式（`global.css`、TSX 内联）禁止硬编码色值，一律 `var(--color-*)` 等语义 Token；类名遵循 `block__element--modifier` + `.is-*`。
2. **架构**：`services → repositories → models` 分层；**写操作必须走 service**（权限/自动化/软删除都在 service 层），路由/组件禁止直接调 repository 写方法；读订阅可用 `db` + `liveQuery`；模型用 Zod 定义；业务错误抛领域错误类。
3. **导入**：一律 `~/` 别名，禁止跨目录 `../`。
4. **组件**：具名函数导出（路由 `default` 除外）；`ui/` 基础组件不得依赖 models/services；图标统一用 `ui/Icon`。
5. **i18n**：用户可见文案进 `~/locales/{zh-CN,en}.ts`，双语同步。
6. **注释/文档语言**：中文，解释"为什么"。
7. **交互**：数据页面三态齐备（加载/空/错误）；破坏性操作走 `ui/ConfirmDialog`；成功反馈走 `ui/Toast`；快捷输入 Enter 确认 / Esc 取消；键盘与 `:focus-visible` 焦点环不可破坏。
8. **安全边界**：纯前端应用，不得引入网络上报/统计 SDK；权限判断在 service 层（`assertProjectPermission`）。

## 需求交付流程（每个需求必须走完）

1. **开发完成 → 本地验证门禁**（两者全绿才算通过）：

   ```bash
   npm run standards   # typecheck + eslint + stylelint + 结构规则
   npm test
   ```

   涉及 UI 的改动须在浏览器实测关键路由。

2. **验证通过 → 自动同步远程**（无需再向用户确认）：
   - 按 Conventional Commits 提交（`feat|fix|style|chore(scope): 描述`），一次需求内聚为一个提交，不混入无关改动；
   - `git push` 至远程当前分支（origin/main）。
3. **验证不通过 → 禁止提交/推送**，修复后从第 1 步重来。

## 常用命令

- 开发 `npm run dev` · 构建 `npm run build` · 生产运行 `npm run start`
- 单测 `npx vitest run <file>` · 类型 `npm run typecheck`

## 目录速查

`app/{models,repositories,services,lib,auth,locales,styles,components,routes}`；`components/{ui,shell,<domain>}`；规范文档 `docs/standards/`；测试 `tests/`。
