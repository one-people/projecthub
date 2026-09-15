# ProjectHub — 基于 Remix 3 的纯前端项目管理应用

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF.svg)](./.github/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](./tsconfig.json)

<!-- TODO: 应用截图占位（看板视图 / 列表视图 / 任务详情弹窗），项目初始化后补充 -->
<!-- <p align="center"><img src="./docs/screenshots/board.png" width="800" alt="看板视图"></p> -->

一个基于 **Remix 3 + TypeScript** 构建的纯前端架构项目管理应用，旨在完整复刻 [Worktile](https://worktile.com/) 的核心功能模块。应用完全在浏览器端运行，不依赖任何后端服务，**所有数据（项目、任务、评论、通知、用户会话、视图偏好等）全部存储在浏览器的 IndexedDB 中**，天然支持离线操作。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [架构设计](#架构设计)
- [目录结构规划](#目录结构规划)
- [数据模型](#数据模型)
- [核心模块设计](#核心模块设计)
- [UI 设计规范](#ui-设计规范)
- [无障碍（a11y）](#无障碍a11y)
- [安全设计](#安全设计)
- [入口骨架（app/index.ts）](#入口骨架appindexts)
- [本地存储与离线同步](#本地存储与离线同步)
- [权限模型（RBAC）](#权限模型rbac)
- [国际化（i18n）](#国际化i18n)
- [测试策略](#测试策略)
- [性能考量](#性能考量)
- [错误处理与边界情况](#错误处理与边界情况)
- [数据备份与迁移](#数据备份与迁移)
- [PWA 与离线安装](#pwa-与离线安装)
- [CI/CD](#cicd)
- [开发指南](#开发指南)
- [环境要求与浏览器兼容性](#环境要求与浏览器兼容性)
- [常见问题（FAQ）](#常见问题faq)
- [贡献指南](#贡献指南)
- [更新日志](#更新日志)
- [License](#license)
- [路线图](#路线图)

---

## 功能特性

### 1. 任务看板视图
- **拖拽排序**：基于 `@dnd-kit/core` 实现高性能拖拽，支持卡片在列间移动与列内重排，带平滑位移动画（FLIP 动画）。
- **状态自动流转**：跨列拖动时自动更新任务状态（如「进行中 → 已完成」），已完成任务自动打勾、归档可选。
- **卡片详情弹窗**：响应式 Dialog，展示任务全貌（描述、负责人、截止日期、优先级、标签、子任务、评论、操作历史），支持键盘导航与焦点陷阱。

### 2. 列表视图
- **多维度筛选**：按负责人、截止日期（今天 / 本周 / 已逾期 / 无日期）、优先级、标签、状态动态组合筛选。
- **自定义排序**：用户可选择排序字段（标题、负责人、截止日期、优先级、更新时间）与升降序，排序偏好持久化到 IndexedDB。
- **视图切换**：看板 / 列表双视图共享同一份数据源，切换零丢失。

### 3. 项目协作功能
- **实时评论系统**：数据存于 IndexedDB，通过 BroadcastChannel 实现同源多标签页实时同步（不可用时降级监听 `storage` 事件）。
- **@提及通知**：评论中 `@用户名` 触发提及解析，生成站内通知（红点 + 通知中心），支持已读 / 未读管理。
- **富文本编辑器**：基于 TipTap 集成，支持加粗、斜体、列表、代码块、引用、链接、图片粘贴，内容以 JSON + HTML 双格式存储。

### 4. 细粒度权限管理（RBAC）
- 预置角色：**管理员 / 项目管理员 / 成员 / 只读访客**，支持自定义角色。
- 权限粒度覆盖：用户管理、项目增删改查、任务增删改查、评论与附件操作。
- UI 层反馈：无权限按钮禁用 + Tooltip 提示；路由级守卫重定向到 403 页面。

---

## 技术栈

| 类别 | 选型 | 说明 |
|------|------|------|
| 框架 | Remix 3 (Vite, SPA Mode) | 路由、clientLoader/clientAction 数据流 |
| 语言 | TypeScript (strict) | 全量类型安全 |
| 样式 | Tailwind CSS 4 | 原子化 CSS + 设计 Token |
| 组件 | Radix UI + shadcn/ui | 无障碍基础组件（Dialog、Dropdown 等） |
| 拖拽 | @dnd-kit/core + sortable | 键盘可访问的拖拽排序 |
| 富文本 | TipTap | 可扩展的 ProseMirror 封装 |
| 状态管理 | clientLoader/clientAction + Zustand | 持久层数据经 clientLoader 装载（SPA 无真实服务端），客户端 UI 状态走 Zustand |
| 本地存储 | Dexie (IndexedDB) | 唯一持久化介质：结构化存储 + 观察订阅，不使用 LocalStorage/后端 |
| 表单校验 | Zod | 运行时数据校验与类型推导 |
| 测试 | Vitest + Testing Library | 单元测试 + 组件测试 |
| 代码质量 | ESLint + Prettier + Biome | 静态检查与格式化 |

---

## 架构设计

```
┌─────────────────────────────────────────────────┐
│                  Remix App (SPA Mode)           │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐   │
│  │  Routes   │  │ Components│  │  UI Store  │   │
│  │ (client   │  │ (Board/   │  │ (Zustand)  │   │
│  │ Loader/…) │  │  List/…)  │  │            │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘   │
│        │              │              │          │
│  ┌─────┴──────────────┴──────────────┴──────┐   │
│  │           Service Layer (领域服务)        │   │
│  │   TaskService / ProjectService /         │   │
│  │   CommentService / AuthService(RBAC)     │   │
│  └───────────────────┬─────────────────────┘   │
│                      │                          │
│  ┌───────────────────┴─────────────────────┐   │
│  │      Repository Layer (数据仓库)         │   │
│  │  Dexie(IndexedDB) + 同步队列 + 版本向量  │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**分层原则**：
- **Route 层**：只做数据装载与动作分发，不含业务逻辑。
- **Service 层**：承载全部业务规则（状态流转、权限校验、提及解析），可独立运行、独立测试。
- **Repository 层**：封装 IndexedDB 读写、乐观更新与同步队列，对上层暴露同步式 API + 响应式订阅。

---

## 目录结构规划

```
remix3/
├── app/
│   ├── root.tsx                    # 应用根组件
│   ├── entry.client.tsx
│   ├── entry.server.tsx            # SPA 模式下的 SSR 兜底
│   ├── routes/
│   │   ├── _index.tsx              # 首页（项目列表）
│   │   ├── login.tsx               # 本地登录（模拟身份）
│   │   ├── projects_.$projectId/
│   │   │   ├── board.tsx           # 任务看板视图
│   │   │   ├── list.tsx            # 列表视图
│   │   │   └── settings.tsx        # 项目设置（成员/角色）
│   │   ├── tasks.$taskId.tsx       # 任务详情弹窗（拦截路由）
│   │   ├── notifications.tsx       # 通知中心
│   │   └── admin.tsx               # 用户与角色管理
│   ├── components/
│   │   ├── board/                  # Board, Column, TaskCard, DragOverlay
│   │   ├── list/                   # ListTable, FilterBar, SortMenu
│   │   ├── task/                   # TaskDialog, Subtasks, ActivityLog
│   │   ├── comments/               # CommentList, CommentEditor, MentionInput
│   │   ├── editor/                 # RichTextEditor (TipTap 封装)
│   │   └── ui/                     # shadcn/ui 基础组件
│   ├── services/                   # 领域服务（纯逻辑，可独立测试）
│   │   ├── task.service.ts
│   │   ├── project.service.ts
│   │   ├── comment.service.ts
│   │   ├── mention.service.ts
│   │   └── notification.service.ts
│   ├── repositories/               # 数据仓库层
│   │   ├── db.ts                   # Dexie schema 定义
│   │   ├── task.repository.ts
│   │   ├── project.repository.ts
│   │   └── sync/
│   │       ├── sync-queue.ts       # 操作队列（离线支持）
│   │       ├── conflict.ts         # 冲突解决（版本向量/LWW）
│   │       └── broadcast.ts        # 多标签页实时同步
│   ├── auth/
│   │   ├── rbac.ts                 # 角色-权限矩阵与 can() 判定
│   │   ├── roles.ts                # 预置角色定义
│   │   └── session.tsx             # 本地会话（当前用户）
│   ├── models/                     # 领域模型与 Zod Schema
│   │   ├── task.ts
│   │   ├── project.ts
│   │   ├── comment.ts
│   │   ├── user.ts
│   │   └── notification.ts
│   ├── stores/                     # Zustand UI 状态
│   │   ├── ui-store.ts
│   │   └── view-preferences.ts
│   ├── lib/                        # 工具函数
│   │   ├── date.ts                 # 截止日期解析/人性化展示
│   │   ├── id.ts                   # UUID 生成
│   │   └── utils.ts
│   └── index.ts                    # 入口：统一导出核心组件与工具函数
├── tests/
│   ├── services/                   # 领域逻辑单元测试
│   ├── repositories/               # fake-indexeddb 集成测试
│   └── components/                 # 组件测试
├── public/
├── vite.config.ts
├── tsconfig.json
└── package.json
```

> 按需求约定，`app/index.ts` 作为项目骨架入口，统一导出主要组件与工具函数，供各模块独立引用。

---

## 数据模型

所有模型均含 `id`、`createdAt`、`updatedAt`、`version`（版本向量，用于冲突解决）。

```ts
// 简化示意，完整定义见 app/models/
interface Project {
  id: string
  name: string
  description: string
  statusColumns: StatusColumn[]   // 可自定义看板列
  memberRoles: Record<userId, RoleId>
}

interface Task {
  id: string
  projectId: string
  title: string
  descriptionRich: JSONContent    // TipTap JSON
  status: string                  // 关联 StatusColumn.id
  assigneeId?: string
  dueDate?: string                // ISO 8601
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  labels: string[]
  subtasks: Subtask[]
  order: string                   // 列内排序权重（fractional indexing，分数字符串）
  archived: boolean
}

interface Comment {
  id: string
  taskId: string
  authorId: string
  contentRich: JSONContent
  mentions: string[]              // 被 @ 的 userId 列表
}

interface Notification {
  id: string
  userId: string                  // 接收者
  type: 'mention' | 'assign' | 'comment' | 'status_change'
  payload: NotificationPayload
  read: boolean
}
```

**排序策略**：看板拖拽采用 fractional indexing（`order` 为分数字符串），避免整列重写，保证拖拽 O(1) 更新。

---

## 核心模块设计

### 状态自动流转
```
拖拽落点列 → TaskService.moveTask()
  → 校验权限（RBAC can('task:update')）
  → 更新 status + order（fractional indexing）
  → 若目标列为「已完成」→ 设置 completedAt，触发通知
  → 写入 sync queue → 广播至其他标签页
```

### @提及解析
评论提交时由 `mention.service.ts` 扫描 TipTap JSON 中的 `mention` 节点，去重后为每个被提及用户生成 `Notification(type: 'mention')`，并在正文中保留高亮锚点，点击可跳转到该用户主页。

### 权限判定
```ts
// auth/rbac.ts
can(user, 'task:update', task) → boolean
```
路由级：clientLoader 中拦截重定向 403；组件级：`<Can>` 条件渲染包装器；操作级：Service 层强制校验（防御式，UI 只是第一道门）。

### 通知触发链路
| 类型 | 触发点 | 接收者 |
|------|--------|--------|
| `mention` | 评论提交时解析到 `@提及` | 被提及的用户 |
| `assign` | 任务被指派 / 改派负责人 | 新负责人 |
| `comment` | 任务有新评论或回复 | 任务关注者（负责人 + 之前的评论者，排除操作者本人） |
| `status_change` | 任务状态流转（含拖拽） | 任务负责人（排除操作者本人） |

所有通知由 `notification.service.ts` 统一生成，去重合并（同一任务短时间多次变更只保留最新一条并累加计数），并经 BroadcastChannel 实时推送到接收者已打开的标签页。

---

## UI 设计规范

### 设计 Token

| 类别 | 定义 |
|------|------|
| 色彩 | 主色 `#3B82F6`（蓝）；优先级色阶：紧急 `#EF4444` / 高 `#F59E0B` / 中 `#3B82F6` / 低 `#10B981` / 无 `gray-400`；语义色：成功 / 警告 / 危险 / 信息，均提供 50-950 色阶 |
| 主题 | 亮色 / 暗色 / 跟随系统三档切换，Token 双套定义，偏好持久化到 IndexedDB |
| 字体 | UI：系统字体栈（`-apple-system, "PingFang SC", "Segoe UI", Roboto`）；代码块：`ui-monospace, "JetBrains Mono", monospace` |
| 字号 | 12 / 13 / 14（正文基准）/ 16 / 18 / 22 / 28，行高 1.5 |
| 间距 | 4px 基数栅格（4 / 8 / 12 / 16 / 24 / 32 / 48） |
| 圆角 | sm 6 / md 8（卡片基准）/ lg 12 / full（头像、徽标） |
| 阴影 | 三级 elevation（card / dropdown / dialog），暗色主题下改用边框 + 微阴影 |
| 动效 | 时长 150ms（微交互）/ 240ms（弹窗、拖拽落位），缓动 `cubic-bezier(0.4, 0, 0.2, 1)`；遵循 `prefers-reduced-motion` |

### 布局示意（看板）

```
┌──────────────────────────────────────────────────────┐
│ Logo │ 项目名 ▾ │ 看板|列表 ││      🔍  通知🔔  头像 │  ← 顶栏 56px
├──────────────────────────────────────────────────────┤
│ 筛选：负责人▾ 截止日期▾ 优先级▾ 标签▾     + 新建任务   │  ← 工具栏
├──────────┬──────────┬──────────┬──────────┬──────────┤
│ 待办 (5) │ 进行中(3)│ 待验证(2)│ 已完成(8)│ + 加列   │
│ ┌──────┐ │ ┌──────┐ │          │ ┌──────┐ │          │
│ │卡片   │ │ │卡片   │ │          │ │卡片✓ │ │          │
│ └──────┘ │ └──────┘ │          │ └──────┘ │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
  水平滚动；卡片 260-320px 自适应；拖拽时源位置半透明虚线占位
```

---

## 无障碍（a11y）

- **目标等级**：WCAG 2.1 AA。
- **键盘操作**：
  - 拖拽：dnd-kit 内置键盘排序——聚焦卡片后按空格抬起，方向键移动，再按空格落位。
  - 弹窗：`Esc` 关闭、打开时焦点移入、关闭时焦点还原、Tab 循环（焦点陷阱）。
  - 全局快捷键：`N` 新建任务、`/` 聚焦搜索、`?` 打开快捷键帮助。
- **屏幕阅读器**：拖拽过程通过 `aria-live` 播报「已抬起卡片 X」「移动到进行中列第 2 位」；通知红点带 `aria-label` 未读数；图标按钮均有关联文本。
- **对比与焦点**：所有交互元素焦点环可见（2px outline + 偏移），色彩对比 ≥ 4.5:1；信息不单独依赖颜色传达（优先级同时有文字/图标）。
- **动画偏好**：尊重 `prefers-reduced-motion`，关闭非必要过渡动画。

---

## 安全设计

纯前端应用同样存在攻击面，重点在渲染不可信内容：

- **富文本 XSS 防护**：TipTap JSON 渲染前经过 schema 白名单过滤（仅允许声明的节点与 mark）；HTML 直渲染路径使用 DOMPurify 清洗；链接仅允许 `http(s)` 协议（拦截 `javascript:` 等）；图片粘贴转存为 IndexedDB Blob 并经 `URL.createObjectURL` 引用。
- **备份导入校验**：导入的 JSON 全量过 Zod Schema，任何字段不符合即整包拒绝；限制导入文件大小（如 ≤ 50MB）与记录条数。
- **@提及注入**：用户名展示前转义，提及节点只存 userId（服务端渲染友好的结构，不内嵌 HTML）。
- **本地会话模型**：无密码、无 token、无 cookie——登录仅是选择本地用户身份，不构成安全边界；因此文档与 UI 中明确提示：本应用数据对同浏览器的任何使用者可见，不适合存储敏感信息。
- **依赖安全**：CI 中运行 `npm audit` 与 Dependabot 定期检查。

---

## 入口骨架（app/index.ts）

按需求约定，`app/index.ts` 作为项目骨架入口，统一导出核心组件与工具函数：

```ts
// app/index.ts —— 项目统一出口（骨架示意）
// 领域模型与 Schema
export * from './models/task'
export * from './models/project'
export * from './models/comment'
export * from './models/user'
export * from './models/notification'

// 领域服务
export * from './services/task.service'
export * from './services/project.service'
export * from './services/comment.service'
export * from './services/notification.service'

// 权限
export { can, Permissions, type Role } from './auth/rbac'
export { ROLES } from './auth/roles'

// 数据仓库
export { db } from './repositories/db'
export { taskRepository } from './repositories/task.repository'
export { projectRepository } from './repositories/project.repository'

// 核心组件（供路由与故事书引用）
export { Board } from './components/board/Board'
export { ListView } from './components/list/ListTable'
export { TaskDialog } from './components/task/TaskDialog'
export { CommentList } from './components/comments/CommentList'
export { RichTextEditor } from './components/editor/RichTextEditor'

// 工具函数
export { formatDate, isOverdue } from './lib/date'
export { uuid } from './lib/id'
```

各核心模块通过该入口互相引用，保证单一出口、可独立测试、可整体复用。

---

## 本地存储与离线同步

**IndexedDB 是本应用唯一的持久化介质**——不使用 LocalStorage、不依赖任何后端服务，所有业务数据与偏好均落库其中。

- **统一存储**：Dexie 封装的 IndexedDB，按模型分表（projects / tasks / comments / notifications / users / preferences / syncQueue），建立 `projectId + status + order` 复合索引支撑看板高效查询。
- **乐观更新**：所有写操作先改本地 + 立即反馈 UI，同时入队 IndexedDB 中的 `sync-queue` 表。
- **冲突解决策略**：
  - 同一标签页：顺序执行，无冲突。
  - 多标签页：BroadcastChannel 实时合并；基于版本向量判断因果，无因果关系的并发写按 **LWW（最后写入优先）+ 字段级合并**（如 A 改标题、B 改负责人，两者都保留）。
  - 存储事件兜底：BroadcastChannel 不可用时降级监听 `storage` 事件（仅作变更通知，数据仍从 IndexedDB 读取）。
- **离线支持**：应用无网络依赖，天然全离线可用；同步队列仅在存在远端配置（可选的未来扩展）时启用上报。
- **容量与清理**：可在设置页提供存储占用统计（`navigator.storage.estimate()`）与数据导出/导入（JSON 备份）能力。

---

## 权限模型（RBAC）

| 权限 | 管理员 | 项目管理员 | 成员 | 只读访客 |
|------|:--:|:--:|:--:|:--:|
| 用户管理 | ✅ | ❌ | ❌ | ❌ |
| 项目创建/删除 | ✅ | ❌ | ❌ | ❌ |
| 项目设置/成员管理 | ✅ | ✅ | ❌ | ❌ |
| 任务增删改 | ✅ | ✅ | ✅ | ❌ |
| 任务查看 | ✅ | ✅ | ✅ | ✅ |
| 评论/回复 | ✅ | ✅ | ✅ | ❌ |
| 通知接收 | ✅ | ✅ | ✅ | ✅ |

权限矩阵集中在 `auth/roles.ts` 定义，可扩展自定义角色（权限位掩码 + 声明式配置）。

---

## 国际化（i18n）

- **目标**：首发中文（zh-CN），架构预留多语言能力。
- **方案**：文案不硬编码，统一收敛到 `app/locales/{zh-CN,en}/` 的命名空间 JSON（common / board / list / task / notifications / settings），类型由 Zod 推导保证 key 完整性。
- **切换**：设置页选择语言，偏好持久化到 IndexedDB，运行时热切换无需刷新。
- **格式化**：日期、相对时间（「3 小时前」）走 `Intl` API 按当前 locale 渲染。

---

## 测试策略

| 层级 | 工具 | 覆盖内容 |
|------|------|---------|
| 领域服务 | Vitest | 状态流转规则、提及解析、权限判定、冲突合并 |
| Repository | Vitest + fake-indexeddb | CRUD、索引查询、同步队列 |
| 组件 | Vitest + Testing Library | 看板拖拽交互、筛选排序、评论编辑器 |
| 类型 | tsc --noEmit | 全量类型检查（CI 门禁） |

示例用例位于 `tests/` 下，核心服务模块均可在 Node 环境独立运行，无需浏览器启动。

---

## 性能考量

- **虚拟滚动**：列表视图与看板列在任务数超过阈值（如 100 条）时启用虚拟化（`@tanstack/react-virtual`），只渲染可视区域行/卡。
- **分页与游标查询**：Dexie 使用 `eachKeyRange` / `offset-limit` 分页加载，列表默认每页 50 条，滚动触底加载更多。
- **拖拽 60fps**：拖拽过程中仅移动 DragOverlay 与占位元素，使用 `transform` 合成层动画，避免触发布局/重排；落点才真正写入 IndexedDB（拖拽中不落库）。
- **响应式订阅按需更新**：通过 Dexie `liveQuery` 精确订阅当前项目/列的数据，避免全表刷新。
- **富文本懒加载**：TipTap 及其扩展按路由级动态 `import()`，不进入主 bundle。
- **防抖持久化**：筛选条件、视图偏好等高频变更防抖 300ms 后写入 IndexedDB。

---

## 错误处理与边界情况

| 场景 | 处理策略 |
|------|---------|
| IndexedDB 不可用（Safari 隐私模式 / 被禁用） | 启动时探测，弹出引导提示；降级为内存模式运行并明确警示「数据不会保存」 |
| 存储配额耗尽（`QuotaExceededError`） | 捕获写入失败，提示清理归档任务 / 导出备份；通知中心提供存储占用入口 |
| 写入事务部分失败 | Dexie 事务保证原子性，失败整体回滚并回滚对应的乐观 UI 更新 |
| 数据损坏（反序列化失败） | Zod Schema 校验入口数据，损坏记录隔离到 `corrupted` 表并提示导出修复 |
| BroadcastChannel 不支持 | 降级监听 `storage` 事件（仅通知，数据仍读 IndexedDB）；两者均不可用则单标签页模式 |
| 版本不兼容的旧数据 | 见[数据备份与迁移](#数据备份与迁移)的升级管线 |

---

## 数据备份与迁移

- **Schema 版本管理**：Dexie 通过 `db.version(n).stores().upgrade()` 声明式升级，每次结构变更递增版本号，升级管线逐级执行，保证老用户数据无损。
- **导出 / 导入**：设置页支持一键导出全库 JSON 快照（含 schema 版本号与导出时间），导入时校验版本并走同一升级管线；用于跨浏览器 / 跨设备迁移与灾备。
- **自动备份**：每日首次启动时自动在 IndexedDB 中保留最近 3 份轻量快照（可关闭）。
- **种子数据**：首次启动检测空库时，可一键灌入演示数据（预置项目、成员、任务、评论），便于快速体验与截图演示。

---

## PWA 与离线安装

应用作为 PWA 分发，实现「安装即离线可用」：

- **Service Worker**：使用 `vite-plugin-pwa`（底层 Workbox）生成。
  - **Precache**：构建产物全部静态资源（JS/CSS/字体/图标）在安装时预缓存，版本化哈希文件名保证发版自动更新。
  - **运行时策略**：`stale-while-revalidate` 用于远程字体与占位图（若有）；应用自身无 API 请求，业务数据不经过 SW，全部走 IndexedDB。
  - **更新策略**：新版本 SW 静默安装后提示「新版本可用，点击刷新」，避免使用中被强制重载导致拖拽/编辑中断。
- **Web App Manifest**：`manifest.webmanifest` 含应用名、主题色（跟随设计 Token 主色 `#3B82F6`）、多尺寸图标（192/512 + maskable）、`display: standalone`，可安装到桌面 / 手机主屏，独立窗口运行。
- **离线兜底**：SW 激活后断网刷新也能完整启动（入口 HTML 同样被 precache）。

---

## CI/CD

使用 GitHub Actions（`.github/workflows/ci.yml`），PR 与 main 分支触发：

```
PR / push
  ├─ install（npm ci，依赖缓存）
  ├─ lint        → ESLint + Biome check
  ├─ typecheck   → tsc --noEmit
  ├─ test        → vitest run（fake-indexeddb，无需浏览器）
  ├─ build       → vite build（产物附带预缓存清单）
  └─ audit       → npm audit --audit-level=high
        │
        ▼ main 分支通过后
  deploy → 静态托管（Vercel / GitHub Pages，纯静态产物，无需 Node 运行时）
```

**门禁**：任一环节失败即阻断合并；`main` 保持随时可部署状态。

---

## 开发指南

```bash
# 环境要求
Node.js >= 20.19

# 安装依赖
npm install

# 本地开发
npm run dev

# 类型检查 / 测试 / 构建
npm run typecheck
npm run test
npm run build
```

---

## 环境要求与浏览器兼容性

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 20.19（开发构建用） |
| 目标浏览器 | Chrome/Edge ≥ 87、Firefox ≥ 78、Safari ≥ 14 |

- **IndexedDB**：核心依赖，上述基线版本均支持；Safari 隐私模式下可能受限，见错误处理章节的降级方案。
- **BroadcastChannel**：Chrome 54+ / Firefox 38+ / Safari 15.4+；更早的 Safari 走 `storage` 事件降级。
- **运行环境**：构建产物为纯静态资源，可部署至任意静态托管（GitHub Pages、Vercel、Nginx 等），无需 Node 运行时。

---

## 常见问题（FAQ）

**Q: 清除浏览器数据会丢失我的项目数据吗？**
会。所有数据仅存于当前浏览器当前源的 IndexedDB 中，清除站点数据即清空。建议定期使用设置页的「导出备份」功能保存 JSON 快照。

**Q: 换一台电脑或浏览器，数据能同步过去吗？**
不能自动同步（无后端）。通过旧环境「导出备份」→ 新环境「导入备份」完成迁移。

**Q: 多个标签页同时打开会互相覆盖数据吗？**
不会。写操作经版本向量 + 字段级合并解决冲突（详见[本地存储与离线同步](#本地存储与离线同步)），并通过 BroadcastChannel 实时互相同步。

**Q: 应用可以完全离线使用吗？**
可以。应用零网络依赖（构建后连 API 请求都没有），首次加载后配合浏览器缓存可完全离线运行。

**Q: 忘记了模拟登录身份怎么办？**
登录是本地模拟的，直接在登录页选择/新建任一本地用户即可；IndexedDB 中的数据不与登录动作绑定丢失。

---

## 贡献指南

1. Fork 仓库并创建特性分支：`git checkout -b feat/your-feature`。
2. 遵循现有架构分层：业务逻辑进 `services/`，不写在组件或路由里；新模型必须带 Zod Schema。
3. 提交前本地通过：`npm run typecheck && npm run test && npm run lint`。
4. 新功能需附带对应测试（服务层单测 / 组件测试）并更新本文档相关章节。
5. 提交信息使用约定式提交（Conventional Commits：`feat:` / `fix:` / `docs:` / `refactor:` / `test:`）。
6. PR 描述包含：变更动机、实现要点、测试方式与截图（UI 变更）。

---

## 更新日志

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 SemVer。

### [Unreleased]
- 完成需求梳理、架构设计与项目文档（本文档）。
- 规划目录结构与 `app/index.ts` 入口骨架。
- 实现全部路线图功能：看板（拖拽/状态流转/详情弹窗）、列表（筛选/排序/虚拟滚动）、评论系统（TipTap 富文本 + @提及 + 通知）、RBAC 权限、liveQuery 多标签页同步、数据导出/导入、a11y、i18n（zh-CN/en）、PWA。

---

## License

MIT License。详见 [LICENSE](./LICENSE)（待项目初始化时创建）。

---

## 路线图

- [x] 需求梳理与架构规划（本文档）
- [x] 项目骨架初始化（`app/index.ts` + 目录结构 + Dexie schema）
- [x] 看板视图（拖拽 + 状态流转 + 详情弹窗）
- [x] 列表视图（筛选 + 自定义排序）
- [x] 评论系统（富文本 + @提及 + 通知）
- [x] RBAC 权限体系
- [x] 离线同步与冲突解决（liveQuery 多标签页实时刷新）
- [x] 数据导出/导入（Zod 全量校验 + 事务原子写入）
- [x] PWA（Service Worker + Manifest + 可安装）
- [x] 虚拟滚动（列表 >100 条自动启用 @tanstack/react-virtual）
- [x] 无障碍（焦点环 / reduced-motion / 拖拽 aria-live 播报）
- [x] 国际化（zh-CN / en，设置页热切换）
- [ ] 单元测试补全
