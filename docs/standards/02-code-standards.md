# 02 · 代码规范（Code Standards）

适用范围：`app/**/*.ts(x)`、`tests/**`、构建与脚本配置。

## 1. 语言与严格性

- TypeScript **strict**（`tsconfig.json` 已开启），禁止 `any`/`as any`；确需宽类型用 `unknown` + 收窄。
- 类型导入一律 `import type { ... }`（纯类型引入）。
- 数据模型用 **Zod schema** 定义并 `z.infer` 导出类型，禁止手写重复的 interface。

## 2. 分层架构（强约束）

```
app/
├── models/        # Zod schema + 类型：数据的唯一形状定义
├── repositories/  # Dexie(IndexedDB) 数据访问：读写 + schema.parse 校验 + 领域错误
├── services/      # 业务逻辑 + RBAC 权限断言（assertProjectPermission）+ 自动化联动
├── lib/           # 纯函数工具（无副作用、可单测）
├── components/    # UI 组件（见组件规范）
├── routes/        # 薄路由：loader/action 编排 service，尽量无业务逻辑
└── auth/ locales/ styles/
```

依赖方向：**services → repositories → models**；`lib` 被任意层引用。

- **读（响应式订阅）**：路由/组件允许 `db` + Dexie `liveQuery` 直接订阅只读数据（纯前端实时刷新模式，如 `_app.users.tsx`）。
- **写（一切变更）**：必须调用 service（权限断言、自动化联动、软删除等领域规则都在 service 层）；路由/组件**禁止**直接调用 repository 的写方法（`create/update/remove/…`）。*（校验脚本强制）*
- Repository：导出单例对象（`export const taskRepository = {...}`），读取时 `schema.parse` 校验，领域错误用 class（如 `VersionConflictError`）。
- Service：面向用例命名（`completeTask`、`listWorkbench`）；权限校验放服务层入口；跨实体联动（自动化触发）在 service 内完成且**失败不阻断主流程**。

## 3. 命名

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 文件 | 目录小写kebab，组件文件 PascalCase | `task.service.ts` / `TaskCard.tsx` |
| 类型/接口 | PascalCase，不带 `I` 前缀 | `TaskUpdatePatch` |
| 变量/函数 | camelCase，布尔值 `is/has/should` 开头 | `isOverdue`、`hasChildren` |
| 常量 | UPPER_SNAKE（真常量）；普通导出对象 camelCase | `PATHS` / `taskRepository` |
| Zod schema | `xxxSchema`，类型同名去 Schema | `taskSchema` / `Task` |
| React 组件 | PascalCase **具名函数导出** | `export function TaskCard()` |
| 事件处理 | `handle*` props，`on*` 回调 props | `handleSelect` / `onClose` |
| 自定义 hook | `use*` 前缀 | `usePanelContext` |

## 4. 导入

- 路径别名一律 `~/`（`~/lib/id`），**禁止 `../` 相对路径跨目录**（同目录 `./` 允许，如 repository 引 `./db`）。*（校验脚本强制）*
- 导入排序：外部包 → `~/` 绝对 → `./` 相对；同组内按路径字母序。
- 禁止循环依赖；`app/index.ts` 是对外的聚合出口，仅 re-export。

## 5. 错误处理

- 可预期业务错误：抛**领域错误类**（`PermissionError`、`VersionConflictError`），由 UI 层按类型提示；禁止用字符串/错误码裸抛。
- `loader`/`action` 返回：校验失败返回 400 语义结构，权限失败由 `assertProjectPermission` 统一抛出。
- 副作用兜底 `catch` 必须注释意图或上报，不允许空 catch 吞错（自动化引擎的"忽略引擎异常"属已注释的白名单场景）。

## 6. 注释与语言

- 注释与文档语言：**中文**；解释"为什么"，不复述代码。
- 导出函数/复杂类型写简短中文 JSDoc；文件顶部一段说明职责（现有风格保持）。
- TODO 格式：`// TODO(主人/事项): 说明`。

## 7. 格式（编辑器无关）

- 2 空格缩进、双引号、分号、行尾无空格、文件末尾一个换行；UTF-8、LF。
- 单行不超过 ~120 字符（长 JSX 属性请换行）；`.editorconfig` 已固化基本项。

## 8. 测试

- 框架 Vitest；纯逻辑（`lib/`、`services/`、`repositories/`）必须有单测，测试文件放 `tests/` 镜像路径。
- 命名 `*.test.ts`；用例标题用中文描述行为（现有风格）；IndexedDB 相关用 `fake-indexeddb`。
- 提交前 `npm test` 必须全绿。

## 9. 依赖与安全

- 新增依赖需说明用途；优先零依赖实现。数据层依赖保持最小（dexie/zod/zustand 等白名单）。
- 纯前端应用：**不得引入任何网络上报/统计 SDK**；用户数据只存 IndexedDB。
