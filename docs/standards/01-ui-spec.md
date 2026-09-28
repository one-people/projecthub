# 01 · UI 规范（Visual Design Spec）

适用范围：`app/styles/**`、所有组件与路由中出现的视觉样式。
设计基调：**Graphite（石墨中性色）+ Indigo（靛蓝品牌色）**，参考 Worktile 的专业项目管理工具气质：克制、信息密度优先、双主题。

## 1. 设计 Token（唯一样式配置来源）

所有设计 Token 定义在 **`app/styles/tokens.css`**，命名空间如下：

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `--color-*` | 语义色 | `--color-primary`、`--color-surface`、`--color-text-secondary` |
| `--space-*` | 间距刻度（4px 基准） | `--space-1`(4) ~ `--space-6`(32) |
| `--radius-*` | 圆角 | `sm`(6) `md`(8) `lg`(12) `full`(999) |
| `--shadow-*` | 阴影层级 | `sm` / `md` / `lg` |
| `--font-*` | 字体族 | `--font-sans` |
| `--motion-fast` / `--transition` | 动效时长 | `100ms` / `150ms` |

### 硬性规则

1. **禁止硬编码色值**：`global.css`、组件内联样式中不得出现 `#hex` / `rgb()` 字面量色值（动态计算除外，见 §5）。需要新颜色时先在 `tokens.css` 增加语义 Token。*（由 Stylelint `color-no-hex` 与校验脚本强制）*
2. **语义优先**：使用 `--color-text-muted` 而不是 `--color-zinc-400` 这类色名直译；Token 按"用途"命名，不按"色值"命名。
3. **组件作用域变量**：组件局部自定义属性（如卡片内 `--tile`）允许定义，但**取值必须引用全局 Token 或 `color-mix()` 派生**，不得引入新字面量。
4. 半透明派生色统一用 `color-mix(in srgb, var(--color-danger) 8%, transparent)` 形式。

## 2. 颜色语义

| Token | 用途 |
| --- | --- |
| `--color-bg` | 页面底色 |
| `--color-surface` / `--color-surface-muted` | 卡片表面 / 次级表面（输入底、表头） |
| `--color-border` / `--color-border-strong` | 常规 / 强调边框（hover、拖拽占位） |
| `--color-text` / `-secondary` / `-muted` / `-faint` | 主文 / 次文 / 弱化 / 装饰线 |
| `--color-primary(-strong/-soft/-contrast)` | 品牌操作色：默认 / hover / 背景 / 前景 |
| `--color-danger(-soft)` `--color-success(-soft)` `--color-warning(-soft)` | 状态色：危险/成功/警告 及其浅底 |
| `--color-on-fill` / `--color-on-danger` | 饱和填充上的前景文字 |
| `--color-inverse-surface` / `--color-inverse-text` | 反色浮层（Toast）及其文字 |
| `--color-rail-*` | 左侧图标栏专用（双主题恒深色） |

**状态色使用约束**：danger 仅用于"删除/不可逆/错误"；success 仅用于"完成/保存成功"；warning 仅用于"今日到期/过期未完成"。不得用状态色做装饰。

## 3. 字体与排版

- 字族：`var(--font-sans)`（Inter + PingFang SC 回退），正文基准 **14px / 行高 1.5**（`body` 已设定）。
- 标题：h1–h3 由 `global.css` 统一 reset（无 margin、紧凑行高、`-0.015em` 字距），页面主标题 18–20px，区块标题 14–16px，辅助说明 12–13px。
- 数字（计数、日期、统计值）使用 `font-variant-numeric: tabular-nums`。
- 中文与英文/数字之间不手工加空格，交给字体渲染；文案中的空格规范见交互文档。

## 4. 间距 / 圆角 / 阴影 / 尺寸

- 间距优先取 `--space-1..6`（4/8/12/16/24/32）；与令牌等值的间距**必须**写 `var(--space-*)`，不得出现裸 px。微调中间值仅允许 **2 / 6 / 10 / 14 / 20**（主栅格的半步与扩展步），须成对一致使用；禁止 3 / 5 / 7 / 9 等一次性奇数值。功能性留白（图标避让 inset、负 margin 出血/重叠）不受刻度限制。
- 圆角：按钮/输入 `--radius-md`，卡片/浮层 `--radius-lg`，小标签/头像 `--radius-full`，微型元素 `--radius-sm`。
- 阴影层级：静止卡片无边框阴影（用 border），悬浮层（Popover/Drawer/Toast）用 `--shadow-lg`；禁止跳级使用。
- 交互目标最小命中区 **≥ 24px**（图标按钮用 padding 撑到 28–32px）；主内容区最大宽度 1440px 居中。

## 5. 暗色模式

- 主题由 `<html data-theme="light|dark">` 驱动（`app/lib/theme.ts` 管理，默认跟随系统）；`tokens.css` 内完成全部主题覆盖，**组件样式不写 `prefers-color-scheme` 查询、不写 `[data-theme]` 分支**。
- 跨主题恒定表面（Rail、Toast）使用 `--color-rail-*` / `--color-inverse-*`，不参与主题切换。
- 需要主题差异的插画/图表色，走 `color-mix()` 基于语义 Token 派生。

## 6. 内联样式（TSX）

- 允许：**动态数值**——尺寸（`width: `${pct}%``）、位置（drag transform、甘特条 offset）、以及「用户数据驱动的颜色」（成员头像底色等来自数据调色板的值）。
- 禁止：**静态主题色**——任何可写进 CSS 类的固定样式（色值、间距、字号）不得内联；发现则下沉为 `global.css` 类。

## 7. 图标

- 统一使用 `app/components/ui/Icon.tsx`（Lucide 风格、24×24 viewBox、stroke 2、`aria-hidden`），默认 18px，导航/工具栏 16–20px。
- 新图标：在 `Icon.tsx` 的 `IconName` 联合类型与 `PATHS` 中登记，**不得在业务组件中散落 `<svg>`**；数据可视化（图表、时间轴连线）除外。

## 8. z-index 层级

| 层 | 取值 | 用途 |
| --- | --- | --- |
| 内容 | 0–2 | 吸顶表头、时间轴连线 |
| 浮层 | 30 | Popover / 下拉菜单 |
| 抽屉 | 40 | Drawer / 批量操作栏 |
| 模态 | 50 | ConfirmDialog |
| 提示 | 60 | Toast |

新增浮层按此表取值，禁止随意递增。
