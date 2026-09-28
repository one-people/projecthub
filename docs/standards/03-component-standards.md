# 03 · 组件规范（Component Standards）

适用范围：`app/components/**`、`app/routes/**` 中的 React 组件。

## 1. 目录与分类

```
app/components/
├── ui/         # 基础组件：Icon、Toast、Popover、ConfirmDialog（与业务无关，可复用）
├── shell/      # 应用骨架：AppShell、AppRail、Breadcrumbs、GlobalSearch、ProjectPanel…
└── <domain>/   # 领域组件：board/ calendar/ list/ table/ timeline/ task/ stats/ comments/ editor/
```

- 基础组件（`ui/`）：不得 import 任何 `~/models`、`~/services`、`~/repositories`；props 泛化（`children`、`onClose`），不出现业务词汇。
- 领域组件：按业务域归类，不建 `common/`、`misc/` 垃圾目录；一个组件一个文件。
- 路由文件保持**薄**：布局编排骨架 + loader/action；页面内 UI 超过一个屏幕即拆到 `components/<domain>/`。

## 2. 组件定义

```tsx
// 单文件单组件；PascalCase 文件名 = 组件名
export interface TaskCardProps {
  task: Task;                 // 领域类型从 ~/models 引入
  onOpen?: (id: string) => void;
}

export function TaskCard({ task, onOpen }: TaskCardProps) {
  // 1. hooks（useMemo/useContext…）
  // 2. 派生状态与局部函数
  // 3. 早返回（加载/空态守卫）
  // 4. 主 JSX
}
```

- **函数组件 + 具名导出**；禁止 `default export` 组件（路由模块的 `default` 导出除外——Remix 约定）。
- Props 类型以 `组件名 + Props` 命名并 `export`；回调统一 `on*`，内部处理函数 `handle*`。
- 状态优先放组件内；跨组件共享才用 zustand / context（如 `shell/panel-context.ts`）；禁止把可派生数据存进 state。

## 3. 数据与副作用

- **读**：响应式数据用 Dexie `liveQuery`（`db` 直连只读订阅）或 Remix `loader`/`useLoaderData`，二选一按页面复杂度取舍；订阅必须在 `useEffect` 中管理生命周期并在卸载时取消（`liveQuery` 返回的 subscription 需 `unsubscribe`）。
- **写**：一律调用 `~/services`（见代码规范 §2），UI 层禁止直接改库；调用后按结果走 Toast/内联错误反馈。
- `useEffect` 仅用于**与外部系统同步**（liveQuery 订阅、DOM 测量、聚焦）；派生值用 `useMemo`/直接计算，不写 effect 链。
- 列表渲染 key 用稳定业务 id（`task.id`），禁止数组下标。

## 4. 样式类命名（BEM 变体）

现有 `global.css` 采用 **`block__element--modifier` + `.is-*` 状态类**，新代码必须一致：

```css
.task-card { }                 /* 块 = 组件名 kebab-case */
.task-card__due { }            /* 元素 */
.task-card__due--overdue { }   /* 修饰符（变体） */
.task-card.is-dragging { }     /* 临时状态（JS 切换，配 .is- 前缀） */
```

- 一个组件的样式集中写在 `global.css` 的对应区块（带 `/* ----- 注释 ----- */` 分节），不新建零散 CSS 文件。
- 状态类（`.is-active` `.is-overdue`）由 JSX 条件拼接，禁止用内联 style 表达状态。

## 5. 可访问性底线

- 交互元素用语义标签：可点用 `<button>`/`<Link>`，输入用 `<input>`/`<select>`；禁止 `<div onClick>`。
- 图标按钮必须有 `aria-label` 或可视文本；纯装饰图标依赖 `Icon` 组件的 `aria-hidden`。
- 表单控件与 `<label>` 关联；浮层（Popover/Drawer/Dialog）关注焦点管理与 `Esc` 关闭（详见交互规范）。
- 保持全局 `:focus-visible` 焦点环可见，不得 `outline: none` 裸去除。

## 6. 性能约定

- 大列表（看板卡片、表格行）使用既有虚拟化方案（`@tanstack/react-virtual`）或分页；新列表渲染 > 200 行必须虚拟化。
- 拖拽使用 `@dnd-kit`，排序键使用 fractional indexing（`~/lib/fractional-index`），禁止重排后全量重写 order。
- 重组件（富文本编辑器 `RichTextEditor`、图表）懒加载或在抽屉打开时才挂载。

## 7. 提交前自查清单

- [ ] 无 `default export`（路由除外）、无 `any`、无 `../` 跨目录导入
- [ ] 样式只用 Token；新样式类遵循 BEM 变体
- [ ] 空态 / 加载态 / 错误态三态齐备（见交互规范）
- [ ] 键盘可用（Tab / Enter / Esc），焦点环未被去除
- [ ] `npm run standards` 通过
