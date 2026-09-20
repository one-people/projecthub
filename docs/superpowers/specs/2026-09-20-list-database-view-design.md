# 列表页 Notion 式数据库视图重设计

日期：2026-09-20
范围：`app/routes/_app.projects_.$projectId.list.tsx` 及其子组件与样式

## 背景

项目页「列表」tab 当前样式粗糙：表头 7 列而数据行仅 6 列导致错位；筛选区为裸排输入框；状态/优先级/负责人均为纯文本，缺乏视觉层级；与看板页的单色极简风格不统一。重设计为 Notion 式数据库视图。

## 布局

1. **顶栏**：项目名 + 角色徽章，右侧 看板/列表/设置 分段切换（沿用 `.segmented`）。
2. **工具栏**（一行）：
   - 左：内联搜索框（放大镜图标，`搜索任务…`）
   - 中：筛选以 chips 展示（如 `状态：进行中 ×`），点击 chip 编辑条件，点 × 移除，尾部「+ 筛选」按钮
   - 右：排序按钮 + 「+ 新建」（新建复用看板页创建逻辑或打开 TaskDialog 新建态）
3. **浮出操作条**：有选中行时底部浮出深色浮层：`已选 N 项 | 批量删除 | 取消`（受 RBAC `task:delete` 约束）。
4. **表格**：占满剩余高度，粘性表头，行高 40px，无斑马纹，hover 高亮 + 细分隔线。

## 单元格

| 列 | 呈现 |
|---|---|
| 复选框 | hover 行时显现；完成态任务常显 |
| 标题 | 加粗；完成态划线置灰 |
| 状态 | 圆角胶囊 badge，按列配色（单色系深浅，颜色由列 id 哈希到预设色板） |
| 负责人 | 圆形头像（姓名首字，哈希色底）+ 姓名；未指派=灰虚线圆 + 「未指派」 |
| 截止日期 | 逾期=红字+圆点；今天=加粗；其余次要色 |
| 优先级 | 带浅色底的 pill（沿用 `PRIORITY_META` 颜色） |
| 更新时间 | 次要色相对时间，右对齐 |

## 交互

- 表头点击排序：升/降切换，指示箭头；与 SortMenu/持久化偏好（`listView:{projectId}`）同一 SortRule 数据源
- 点击行打开 TaskDialog（不变）
- 保留：虚拟滚动（>100 条，`@tanstack/react-virtual`）、undo toast、i18n、liveQuery 实时刷新、筛选/排序偏好持久化

## 实现结构

- `app/components/list/`：
  - `ListTable.tsx` 重构：保留虚拟滚动骨架，拆出单元格组件 `TitleCell`、`StatusBadge`、`AssigneeCell`、`DueCell`、`PriorityPill`（可单文件内多组件）
  - `FilterBar.tsx` → 重写为 `FilterChips.tsx`（chips + 弹出编辑弹层）
  - `SortMenu.tsx` 保留但可简化为表头排序的入口
- 样式：`app/styles/global.css` 新增 `.db-` 前缀类，修复 `.data-grid` 列数不一致问题（统一 7 列模板），全部使用现有 design token
- 数据层 `lib/list-query.ts`、服务层、RBAC 不动

## 验收

- 表头与数据行 7 列严格对齐
- 筛选、排序、偏好持久化、批量删除+undo、虚拟滚动、i18n 全部回归可用
- 中英语言切换正常
- 视觉与看板页/侧边栏单色极简风格一致
