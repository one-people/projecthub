# 视觉重设计（现代 SaaS · 纯样式层）

**目标**：在不改动任何组件 DOM/逻辑的前提下，通过设计 Token 与全局 CSS 重写，将现有界面提升到商业级 SaaS 视觉水准。

**范围**：仅 `app/styles/global.css`（+ root.tsx 字体链接如需更换）。不新增组件、不改类名。

## 设计决策

### 色板
- 主色 Indigo：`--color-primary: #4f46e5`，strong `#4338ca`，soft `#e0e7ff`
- 中性色 slate 阶梯：bg `#f8fafc` / surface `#ffffff` / surface-muted `#f1f5f9` / border `#e2e8f0` / border-strong `#cbd5e1` / text `#0f172a` / secondary `#475569` / muted `#94a3b8`
- 语义色 600 级：success `#059669`、warning `#d97706`、danger `#dc2626`、info `#0284c7`；accent `#ea580c`
- 深色模式：slate-950/900/800 背景 + indigo-400 主色 + 对应 tonal 软色

### 字体
- `Inter`（Google Fonts，`font-display: swap`）+ PingFang SC / 系统回退
- 字号阶梯：12 / 13 / 14（正文）/ 16 / 18 / 22 / 28；标题 letter-spacing -0.01em

### 布局与形状
- 间距阶梯保持 4/8/12/16/24/32
- 圆角：sm 6 / md 8 / lg 12 / full
- 阴影 3 级：`--shadow-sm`（卡片静态）、`--shadow-md`（hover/下拉）、`--shadow-lg`（模态）

### 组件样式要点
- **侧边栏**：深色 slate-900 底 + 白字，激活项左侧 3px indigo 指示条 + indigo-soft 文字；折叠态一致
- **顶栏**：白底 1px 底边框，面包屑 muted 分隔
- **卡片**：border + shadow-sm，hover 时 shadow-md + 边框加深（可交互卡片）
- **按钮**：高度 36px，primary indigo 实底，danger 红描边；focus 双环（outline 2px + offset 2px）
- **输入框**：高度 36px，hover 边框 indigo-300，focus ring indigo
- **表格/列表**：表头 12px 大写 0.05em 字距 muted；行 hover surface-muted；无斑马纹；行高 44px
- **看板**：列底 surface-muted 圆角容器，卡片白底 shadow-sm + hover 浮起
- **徽标/优先级点**：统一 soft 底 + 600 级前景色
- **Toast**：深色底白字 + 操作按钮 indigo-300；Confirm 模态 shadow-lg

### 验证
- `npx tsc --noEmit && npx vitest run && npx remix vite:build`
- 逐页目检：工作台、看板、列表、项目设置、回收站、用户管理、审计、登录
