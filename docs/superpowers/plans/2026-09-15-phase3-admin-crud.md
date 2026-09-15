# 阶段三：管理后台 + 项目设置 + CRUD 规范 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐用户管理、操作审计、项目设置（成员/状态列/危险区）页面，落地统一 CRUD 反馈规范（toast/undo、确认弹窗、批量删除、全局搜索）。

**Architecture:** 新增全局 `ToastProvider`（root 挂载）与 `ConfirmDialog` 通用组件；User 模型扩展 `email`/`active`（非索引字段，无需 Dexie 升版）；项目设置复用 trashService 做危险区删除；全局搜索为 `/` 键唤起的对话框（内存过滤 tasks+projects）。本计划由同一执行者在会话内实施，代码以各任务实现为准。

**Spec:** `docs/superpowers/specs/2026-09-15-enterprise-redesign-design.md` 第 5、6 节。

---

### Task 1: Toast + ConfirmDialog 基础组件

**Files:**
- Create: `app/components/ui/Toast.tsx`（ToastProvider + useToast：`success(msg, {undo})` 3s 自动关、undo 倒计时 10s；`error(msg, {retry})` 手动关）
- Create: `app/components/ui/ConfirmDialog.tsx`（props：title、message、danger、requireText?——需输入指定文本才可确认）
- Modify: `app/root.tsx`（包 ToastProvider）、`app/styles/global.css`

验证：typecheck + build；成功 toast 3 秒消失（用 vi.useFakeTimers 单测 undo 回调）。

### Task 2: User 模型扩展 + userService（TDD）

**Files:**
- Modify: `app/models/user.ts`（`email: z.string().default("")`、`active: z.boolean().default(true)`）
- Create: `app/services/user.service.ts`：`create(actorRole, {name, email, avatarColor})`、`update(actorRole, id, patch)`、`deactivate(actorRole, id)`——全部断言 `user:manage`，写审计
- Test: `tests/user.service.test.ts`（权限拒绝 + 创建写审计 + 停用后 list 返回 active 标记）

### Task 3: 用户管理页 `/admin/users`

表格（头像/姓名/邮箱/创建时间/状态）+ 新建/编辑对话框（失焦校验：姓名必填 ≤50）+ 停用（确认弹窗）；非 admin 由侧栏隐藏（已有），页面内再校验。指派/提及列表过滤 `active`（FilterBar assigneeOptions、RichTextEditor users）。

### Task 4: 操作审计页 `/admin/audit`

时间线表格（时间/操作者头像/动作徽章着色/摘要）+ 筛选（操作者下拉、动作、实体类型）+ 分页每页 50（上一页/下一页，基于 auditService.list limit 扩展 offset——list 增加 `offset` 参数）。

### Task 5: 工作台动态流

`_app._index.tsx` 右侧栏追加"动态"卡片：liveQuery 订阅 `auditService.list({ limit: 20 })`，每条显示相对时间 + 摘要；任务类条目可点击打开 TaskDialog（按 entityId 查任务）。

### Task 6: 项目设置页 `/projects/:id/settings`

`_app.projects_.$projectId.settings.tsx`，四个 Tab：
- 基本信息：改名/描述（失焦校验，保存 toast）
- 成员与角色：成员表格、行内角色下拉（projectAdmin+，需 `member:manage` 权限——roles.ts 增加 permission）、移除成员（确认）
- 状态列：列表 + 新增/重命名/删除列（删除需确认，列下有任务时禁止）、上移/下移（order 重排）
- 危险区：红框隔离，输入项目名确认 → `trashService.deleteProject` → toast（undo=restoreProject）→ 跳回 /projects

数据操作直接走 db + 审计（项目更新断言 `project:update`）。看板/列表页头加"设置"入口按钮。

### Task 7: 删除交互接入 + 批量删除

- TaskDialog 增加删除按钮（member+）：确认弹窗 → `trashService.deleteTask` → toast（undo 恢复）
- ListTable 行多选（checkbox 列）：选中后浮现工具条"删除所选 (n)"，确认后逐条软删，toast undo 逐条恢复
- 乐观锁冲突：TaskDialog 保存捕获 `VersionConflictError` → alert 提示 + "加载最新"按钮

### Task 8: 全局搜索

`app/components/shell/GlobalSearch.tsx`：`/` 键唤起（输入框内除外），Esc 关闭；实时内存过滤任务（标题）与项目（名称），上下键选择、回车跳转（任务→打开对话框所在看板页；项目→看板）。侧栏搜索按钮改为可点击并触发同一对话框。

### Task 9: 阶段验收

`npx tsc --noEmit && npx vitest run && npx remix vite:build` + 手动走查（用户 CRUD、审计筛选、项目设置四 Tab、删除 undo、批量删除、搜索、权限矩阵抽查 guest/member/projectAdmin/admin）。
