# 阶段一：AppShell + 路由重排 + 工作台首页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立全局 AppShell（侧边栏 + 面包屑 + 用户卡片），把现有页面迁入新信息架构，并用聚合查询实现工作台首页。

**Architecture:** Remix flat routes 增加无路径布局路由 `_app.tsx`，其下所有子路由共享 AppShell 布局；面包屑通过 route `handle` + `useMatches` 生成；工作台数据由新的 `workbenchService` 一次性聚合（liveQuery 驱动实时刷新）。现有 service/repository 层不动。

**Tech Stack:** Remix 2.16 SPA 模式、Dexie liveQuery、现有 i18n/Icon/设计系统（global.css）。

**Spec:** `docs/superpowers/specs/2026-09-15-enterprise-redesign-design.md`

**注意：** 本目录当前不是 git 仓库，Task 0 先初始化。全局搜索（`/` 键）在 spec 中属于 AppShell，但依赖任务/项目索引查询，放到阶段三与 CRUD 规范一起做，本阶段侧栏只放搜索入口占位（disabled + 提示"阶段三开放"）。

---

### Task 0: 初始化 git 仓库

**Files:** 无新文件（生成 `.gitignore`）

- [ ] **Step 1: 创建 .gitignore**

```gitignore
node_modules
/build
/.cache
.env
```

- [ ] **Step 2: git init 并首提交**

```bash
git init && git add -A && git commit -m "chore: baseline before enterprise redesign phase 1"
```

---

### Task 1: workbenchService 聚合查询（TDD）

**Files:**
- Create: `app/services/workbench.service.ts`
- Test: `tests/workbench.service.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { workbenchService } from "../app/services/workbench.service";
import { uuid } from "../app/lib/id";

const now = new Date().toISOString();
const today = new Date().toISOString();
const overdue = new Date(Date.now() - 86400000).toISOString();

async function seed() {
  const uid = uuid();
  await db.users.add({ id: uid, name: "我", avatarColor: "#3B82F6", createdAt: now });
  await db.projects.add({
    id: "p1", name: "项目A", description: "", statusColumns: [
      { id: "c1", name: "待办", order: 0 }, { id: "c2", name: "完成", order: 1 },
    ], memberRoles: { [uid]: "member" }, createdAt: now, updatedAt: now,
  });
  await db.tasks.bulkAdd([
    { id: "t1", projectId: "p1", title: "待处理", descriptionRich: null, status: "c1", assigneeId: uid, dueDate: today, priority: "high", labels: [], subtasks: [], order: "a0", archived: false, completedAt: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t2", projectId: "p1", title: "已逾期", descriptionRich: null, status: "c1", assigneeId: uid, dueDate: overdue, priority: "urgent", labels: [], subtasks: [], order: "a1", archived: false, completedAt: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t3", projectId: "p1", title: "别人的", descriptionRich: null, status: "c1", assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [], order: "a2", archived: false, completedAt: null, createdAt: now, updatedAt: now, version: 0 },
    { id: "t4", projectId: "p1", title: "已完成", descriptionRich: null, status: "c2", assigneeId: uid, dueDate: null, priority: "none", labels: [], subtasks: [], order: "a3", archived: false, completedAt: new Date().toISOString(), createdAt: now, updatedAt: now, version: 0 },
  ]);
  return uid;
}

describe("workbenchService.load", () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.users.clear(), db.notifications.clear()]);
  });

  it("按 assignee 过滤并分四组", async () => {
    const uid = await seed();
    const data = await workbenchService.load(uid);
    expect(data.pending.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(data.today.map((t) => t.id)).toEqual(["t1"]);
    expect(data.overdue.map((t) => t.id)).toEqual(["t2"]);
    expect(data.recent.map((t) => t.id)).toContain("t1");
    expect(data.pending.every((t) => t.completedAt === null)).toBe(true);
  });

  it("项目卡片含未完成任务数", async () => {
    const uid = await seed();
    const data = await workbenchService.load(uid);
    const card = data.projects.find((p) => p.id === "p1")!;
    expect(card.openTaskCount).toBe(3);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/workbench.service.test.ts`
Expected: FAIL — `Cannot find module .../workbench.service`

- [ ] **Step 3: 实现服务**

```typescript
import { db } from "~/repositories/db";
import type { Task } from "~/models/task";
import type { Project } from "~/models/project";

export interface WorkbenchProjectCard {
  id: string;
  name: string;
  openTaskCount: number;
}

export interface WorkbenchData {
  pending: Task[];   // assignee 是我、未完成
  today: Task[];     // 今日到期、未完成
  overdue: Task[];   // 已逾期、未完成
  recent: Task[];    // 我负责或创建、最近更新（最多 20 条）
  projects: WorkbenchProjectCard[];
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const workbenchService = {
  async load(userId: string): Promise<WorkbenchData> {
    const [allTasks, projects] = await Promise.all([
      db.tasks.toArray(),
      db.projects.toArray(),
    ]);
    const mine = allTasks.filter(
      (t) => t.assigneeId === userId && t.completedAt === null,
    );
    const dayStart = startOfDay().getTime();
    const dayEnd = dayStart + 86400000;
    const due = (t: Task) => t.dueDate !== null && new Date(t.dueDate).getTime() < dayEnd;
    const isToday = (t: Task) =>
      t.dueDate !== null &&
      new Date(t.dueDate).getTime() >= dayStart &&
      new Date(t.dueDate).getTime() < dayEnd;
    const isOverdue = (t: Task) =>
      t.dueDate !== null && new Date(t.dueDate).getTime() < dayStart;

    const projects_ = projects.map((p: Project) => ({
      id: p.id,
      name: p.name,
      openTaskCount: allTasks.filter((t) => t.projectId === p.id && t.completedAt === null).length,
    }));

    return {
      pending: mine,
      today: mine.filter(isToday),
      overdue: mine.filter(isOverdue),
      recent: mine
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
      projects: projects_,
    };
  },
};
```

（`due` 辅助未被使用则删除，保留 `isToday`/`isOverdue`。）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/workbench.service.test.ts`
Expected: PASS 2 tests

- [ ] **Step 5: Commit**

```bash
git add app/services/workbench.service.ts tests/workbench.service.test.ts
git commit -m "feat: workbench aggregate service with grouped my-task queries"
```

---

### Task 2: 路由重排（文件改名进 `_app` 布局）

**Files:**
- Create: `app/routes/_app.tsx`（无路径布局，渲染 AppShell）
- Rename: `_index.tsx` → `_app._index.tsx`（内容将在 Task 4 重写为工作台）
- Create: `app/routes/_app.projects.tsx`（项目列表，内容从旧 `_index.tsx` 迁移，Task 5）
- Rename: `notifications.tsx` → `_app.notifications.tsx`
- Rename: `settings.tsx` → `_app.settings.tsx`
- Rename: `projects_.$projectId.board.tsx` → `_app.projects_.$projectId.board.tsx`
- Rename: `projects_.$projectId.list.tsx` → `_app.projects_.$projectId.list.tsx`

- [ ] **Step 1: git mv 重命名**

```bash
mkdir -p app/routes/_app.projects_
git mv app/routes/_index.tsx app/routes/_app._index.tsx
git mv app/routes/notifications.tsx app/routes/_app.notifications.tsx
git mv app/routes/settings.tsx app/routes/_app.settings.tsx
git mv app/routes/projects_.\$projectId.board.tsx app/routes/_app.projects_/\$projectId.board.tsx
git mv app/routes/projects_.\$projectId.list.tsx app/routes/_app.projects_/\$projectId.list.tsx
```

- [ ] **Step 2: 创建占位 `_app.tsx`（先直通，Task 3 换成 AppShell）**

```typescript
import { Outlet } from "@remix-run/react";

export default function AppLayout() {
  return <Outlet />;
}
```

- [ ] **Step 3: 修 board/list 路由里的 projectId 解析**

两个视图文件里都有 `window.location.pathname.split("/")[2]`，新路径多了一级前缀（`/projects/:id/board` 不变——路径未变，只是文件层级变化），确认无需修改；但列表/看板内 `navigate("/projects/...")` 与 `navigate("/")` 目标不变。运行 typecheck：

Run: `npx tsc --noEmit`
Expected: 无错误（`_app._index.tsx` 仍编译）

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: nest all routes under pathless _app layout"
```

---

### Task 3: AppShell 组件（侧边栏 + 顶栏面包屑 + 用户卡片）

**Files:**
- Create: `app/components/shell/AppShell.tsx`
- Create: `app/components/shell/Sidebar.tsx`
- Create: `app/components/shell/Breadcrumbs.tsx`
- Create: `app/components/shell/UserCard.tsx`
- Modify: `app/routes/_app.tsx`
- Modify: `app/styles/global.css`（追加 shell 样式）
- Modify: `app/components/ui/Icon.tsx`（新增 `home`、`trash`、`search`、`chevron-right`、`panel` 图标）

- [ ] **Step 1: Icon.tsx 增加图标**

在 `IconName` 联合类型追加 `"home" | "trash" | "search" | "chevronRight" | "panel"`，并在 paths 映射中追加（24×24 viewBox、stroke 2，Lucide 风格路径）：

```typescript
home: <path d="M3 10.5 12 3l9 7.5V21H3z" />,  // 简化屋形，可按现有图标写法用 polyline/path 组合
trash: (
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
  </>
),
search: (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
),
chevronRight: <path d="m9 6 6 6-6 6" />,
panel: (
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>
),
```

`home` 建议对齐现有写法：

```typescript
home: (
  <>
    <path d="m3 10 9-7 9 7" />
    <path d="M5 9v11h14V9" />
  </>
),
```

- [ ] **Step 2: UserCard（当前用户 + 切换身份）**

```typescript
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import type { User } from "~/models/user";

export function UserCard() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      setMe(await session.currentUser());
      setUsers(await db.users.toArray());
    })();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!me) return null;

  return (
    <div className="user-card" ref={ref}>
      <button className="user-card__trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="avatar" style={{ background: me.avatarColor }}>{me.name.slice(0, 1)}</span>
        <span className="user-card__name">{me.name}</span>
        <Icon name="chevronRight" size={14} />
      </button>
      {open && (
        <div className="user-card__menu" role="menu">
          <p className="field-label">{t("currentUser")}</p>
          {users.map((u) => (
            <button
              key={u.id}
              className="user-card__item"
              role="menuitem"
              onClick={async () => {
                await session.switchUser(u.id);
                setOpen(false);
                navigate(".");
              }}
            >
              <span className="avatar" style={{ background: u.avatarColor }}>{u.name.slice(0, 1)}</span>
              {u.name}
              {u.id === me.id && <Icon name="check" size={14} />}
            </button>
          ))}
          <button
            className="user-card__item"
            role="menuitem"
            onClick={() => navigate("/settings")}
          >
            <Icon name="settings" size={14} />
            {t("settings")}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Breadcrumbs（useMatches + handle）**

```typescript
import { Link, useMatches } from "@remix-run/react";
import { Icon } from "~/components/ui/Icon";

interface CrumbHandle {
  crumb?: (t: (k: never) => string) => { label: string; to?: string };
}

export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .map((m) => (m.handle as CrumbHandle | undefined)?.crumb)
    .filter(Boolean);
  if (crumbs.length === 0) return null;
  return (
    <nav className="breadcrumbs" aria-label="面包屑">
      {crumbs.map((c, i) => {
        const crumb = c as { label: string; to?: string };
        return (
          <span key={i} className="breadcrumbs__item">
            {i > 0 && <Icon name="chevronRight" size={13} />}
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Sidebar**

```typescript
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { UserCard } from "./UserCard";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await session.currentUser();
      const ps = await db.projects.toArray();
      setIsAdmin(ps.some((p) => p.memberRoles[me.id] === "admin"));
    })();
    const sub = liveQuery(async () => {
      const me = await session.currentUser();
      const rows = await db.notifications.where("userId").equals(me.id).toArray();
      return rows.filter((n) => !n.read).length;
    }).subscribe(setUnread);
    return () => sub.unsubscribe();
  }, []);

  const item = (to: string, icon: Parameters<typeof Icon>[0]["name"], label: string, badge?: number) => (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar__item${isActive ? " is-active" : ""}`}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} size={17} />
      {!collapsed && <span>{label}</span>}
      {badge !== undefined && badge > 0 && <span className="sidebar__badge">{badge}</span>}
    </NavLink>
  );

  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar__top">
        <button className="sidebar__brand" onClick={() => navigate("/")}>
          <span className="brand__mark"><Icon name="brand" size={16} /></span>
          {!collapsed && <span>ProjectHub</span>}
        </button>
        <button className="sidebar__search" disabled title="全局搜索（阶段三开放）">
          <Icon name="search" size={15} />
          {!collapsed && <span className="hint">{t("searchPlaceholder")}</span>}
        </button>
        <nav className="sidebar__nav" aria-label="主导航">
          {item("/", "home", t("workbench"))}
          {item("/projects", "kanban", t("projects"))}
          {item("/notifications", "bell", t("notifications"), unread)}
          {item("/trash", "trash", t("trash"))}
        </nav>
        {isAdmin && !collapsed && (
          <div className="sidebar__group">
            <p className="field-label">{t("adminGroup")}</p>
            {item("/admin/users", "user", t("userManage"))}
            {item("/admin/audit", "list", t("auditLog"))}
          </div>
        )}
      </div>
      <div className="sidebar__bottom">
        <UserCard />
        <button className="icon-btn" onClick={onToggle} aria-label="折叠侧边栏">
          <Icon name="panel" size={16} />
        </button>
      </div>
    </aside>
  );
}
```

注意：`/trash`、`/admin/*` 页面本阶段尚不存在——Task 6 先建占位页防止 404。

- [ ] **Step 5: AppShell 组合**

```typescript
import { useEffect, useState } from "react";
import { Outlet } from "@remix-run/react";
import { Sidebar } from "./Sidebar";
import { Breadcrumbs } from "./Breadcrumbs";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="shell__main">
        <header className="topbar">
          <Breadcrumbs />
        </header>
        <div className="shell__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `_app.tsx` 使用 AppShell**

```typescript
import { AppShell } from "~/components/shell/AppShell";

export default function AppLayout() {
  return <AppShell />;
}
```

- [ ] **Step 7: global.css 追加 shell 样式**

在文件末尾追加（沿用现有 token：`--color-*`、150ms ease）：

```css
.shell { display: flex; min-height: 100dvh; }
.shell__main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  height: 52px; display: flex; align-items: center; gap: 12px;
  padding: 0 20px; border-bottom: 1px solid var(--color-border);
  background: var(--color-surface); position: sticky; top: 0; z-index: 20;
}
.shell__content { flex: 1; padding: 20px; }

.sidebar {
  width: 240px; flex-shrink: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--color-border); background: var(--color-surface);
  transition: width 150ms ease; overflow: hidden;
}
.sidebar.is-collapsed { width: 64px; }
.sidebar__top { flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 8px; }
.sidebar__brand {
  display: flex; align-items: center; gap: 8px; font-weight: 700;
  background: none; border: none; cursor: pointer; padding: 6px 8px; color: var(--color-text);
}
.sidebar__search {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 8px;
  background: var(--color-bg); color: var(--color-text-secondary); cursor: not-allowed;
}
.sidebar__nav { display: flex; flex-direction: column; gap: 2px; }
.sidebar__item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border-radius: 8px; color: var(--color-text-secondary); text-decoration: none;
  position: relative; transition: background 150ms ease, color 150ms ease;
}
.sidebar__item:hover { background: var(--color-bg); color: var(--color-text); }
.sidebar__item.is-active { background: var(--color-primary-soft); color: var(--color-primary-strong); font-weight: 600; }
.sidebar__badge {
  margin-left: auto; min-width: 18px; height: 18px; border-radius: 9px;
  background: var(--color-accent); color: #fff; font-size: 11px;
  display: inline-flex; align-items: center; justify-content: center; padding: 0 5px;
}
.sidebar__group { margin-top: 12px; display: flex; flex-direction: column; gap: 2px; }
.sidebar__bottom { padding: 10px; border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 8px; }
.sidebar.is-collapsed .sidebar__bottom { align-items: center; }

.user-card { position: relative; }
.user-card__trigger {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: none; background: none; cursor: pointer;
  border-radius: 8px; color: var(--color-text);
}
.user-card__trigger:hover { background: var(--color-bg); }
.user-card__menu {
  position: absolute; bottom: calc(100% + 6px); left: 0; width: 220px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 2px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 8%); z-index: 100;
}
.user-card__item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;
  border: none; background: none; cursor: pointer; border-radius: 6px;
  color: var(--color-text); text-align: left; width: 100%;
}
.user-card__item:hover { background: var(--color-bg); }

.breadcrumbs { display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--color-text-secondary); }
.breadcrumbs__item { display: inline-flex; align-items: center; gap: 4px; }
.breadcrumbs__item a { color: var(--color-text-secondary); text-decoration: none; }
.breadcrumbs__item a:hover { color: var(--color-primary-strong); }
```

（若现有 token 名不同——如 `--color-border`/`--color-surface` 在 global.css 中叫别的名字——以 global.css 实际为准替换。）

- [ ] **Step 8: typecheck + build**

Run: `npx tsc --noEmit && npx remix vite:build`
Expected: 均通过

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: AppShell with collapsible sidebar, breadcrumbs and user card"
```

---

### Task 4: 占位路由（trash / admin）

**Files:**
- Create: `app/routes/_app.trash.tsx`
- Create: `app/routes/_app.admin.users.tsx`
- Create: `app/routes/_app.admin.audit.tsx`

- [ ] **Step 1: 三个占位页（同构模板，trash 为例）**

```typescript
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";

export default function TrashRoute() {
  const { t } = useI18n();
  return (
    <div className="empty">
      <Icon name="trash" size={32} />
      <p style={{ margin: 0 }}>{t("comingSoon")}</p>
    </div>
  );
}
```

`_app.admin.users.tsx`（icon `user`）、`_app.admin.audit.tsx`（icon `list`）同模板改 icon 与默认导出名（`UsersRoute` / `AuditRoute`）。同时删除各页原有的 `page`/`app-header` 包装（由 AppShell 提供）——本任务只建占位，现有 notifications/settings/board/list 中的旧页头清理放 Task 6。

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add app/routes/_app.trash.tsx app/routes/_app.admin.users.tsx app/routes/_app.admin.audit.tsx
git commit -m "feat: placeholder routes for trash and admin (phase 2/3)"
```

---

### Task 5: i18n 词条

**Files:**
- Modify: `app/locales/zh-CN.ts`
- Modify: `app/locales/en.ts`

- [ ] **Step 1: zh-CN 追加**

```typescript
workbench: "工作台",
projectsNav: "项目",
projects: "项目",
trash: "回收站",
adminGroup: "管理后台",
userManage: "用户管理",
auditLog: "操作审计",
searchPlaceholder: "搜索…（阶段三开放）",
comingSoon: "建设中（后续阶段开放）",
goodMorning: "早上好",
goodAfternoon: "下午好",
goodEvening: "晚上好",
todayDue: "今日到期",
overdueCount: "已逾期",
myTasks: "我的任务",
tabPending: "待处理",
tabToday: "今日到期",
tabOverdue: "已逾期",
tabRecent: "最近更新",
noMyTasks: "暂无任务，去项目里看看吧",
activity: "动态",
myProjects: "我的项目",
goProjects: "去项目列表",
allProjects: "全部项目",
```

（`projects` 与 `projectsNav` 二选一即可，删掉未用的那个，保持 Dict 键一致。）

- [ ] **Step 2: en.ts 追加对应英文**

```typescript
workbench: "Workbench",
projects: "Projects",
trash: "Trash",
adminGroup: "Administration",
userManage: "Users",
auditLog: "Audit Log",
searchPlaceholder: "Search… (phase 3)",
comingSoon: "Coming soon (later phase)",
goodMorning: "Good morning",
goodAfternoon: "Good afternoon",
goodEvening: "Good evening",
todayDue: "Due today",
overdueCount: "Overdue",
myTasks: "My Tasks",
tabPending: "Pending",
tabToday: "Due Today",
tabOverdue: "Overdue",
tabRecent: "Recently Updated",
noMyTasks: "No tasks yet — check your projects",
activity: "Activity",
myProjects: "My Projects",
goProjects: "Go to projects",
allProjects: "All Projects",
```

- [ ] **Step 3: typecheck**

Run: `npx tsc --noEmit`（Dict 键不匹配会在此暴露）
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add app/locales && git commit -m "feat: i18n keys for workbench and shell navigation"
```

---

### Task 6: 工作台首页（重写 `_app._index.tsx`）

**Files:**
- Modify: `app/routes/_app._index.tsx`（全量重写）

- [ ] **Step 1: 重写为工作台**

```typescript
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { workbenchService, type WorkbenchData } from "~/services/workbench.service";
import { projectRepository } from "~/repositories/project.repository";
import { PRIORITY_META } from "~/lib/priority";
import { formatDate, isOverdue } from "~/lib/date";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { TaskDialog } from "~/components/task/TaskDialog";
import type { Task } from "~/models/task";
import type { Project } from "~/models/project";

type Tab = "pending" | "today" | "overdue" | "recent";

export const handle = { crumb: () => ({ label: "工作台" }) };

export default function WorkbenchRoute() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [openTask, setOpenTask] = useState<Task | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const me = await session.currentUser();
      const sub = liveQuery(() => workbenchService.load(me.id)).subscribe(setData);
      unsub = () => sub.unsubscribe();
    })();
    const sub2 = liveQuery(() => db.projects.toArray()).subscribe(setProjects);
    return () => { unsub?.(); sub2.unsubscribe(); };
  }, []);

  const statusName = useMemo(() => {
    const p = projects.find((p) => p.id === openTask?.projectId);
    return p?.statusColumns.find((c) => c.id === openTask?.status)?.name;
  }, [projects, openTask]);

  if (!data) {
    return <div className="workbench"><div className="skeleton" style={{ height: 120 }} /></div>;
  }

  const groups: Record<Tab, string> = {
    pending: t("tabPending"), today: t("tabToday"),
    overdue: t("tabOverdue"), recent: t("tabRecent"),
  };
  const rows = data[tab];
  const hour = new Date().getHours();
  const greet = hour < 12 ? t("goodMorning") : hour < 18 ? t("goodAfternoon") : t("goodEvening");

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="workbench">
      <div className="workbench__hero">
        <h1 style={{ fontSize: 20, margin: 0 }}>{greet}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge">{t("todayDue")} {data.today.length}</span>
          <span className="badge badge--danger">{t("overdueCount")} {data.overdue.length}</span>
        </div>
      </div>

      <div className="workbench__body">
        <section className="card" aria-label={t("myTasks")}>
          <nav className="segmented" aria-label={t("myTasks")}>
            {(Object.keys(groups) as Tab[]).map((k) => (
              <button
                key={k}
                className={`segmented__item${tab === k ? " segmented__item--active" : ""}`}
                onClick={() => setTab(k)}
              >
                {groups[k]}（{data[k].length}）
              </button>
            ))}
          </nav>
          <ul className="my-task-list">
            {rows.map((task) => (
              <li key={task.id}>
                <button className="my-task" onClick={() => setOpenTask(task)}>
                  <span className={`prio prio--${task.priority}`}>
                    <span className="prio__dot" style={{ background: PRIORITY_META[task.priority].color }} />
                    {PRIORITY_META[task.priority].label}
                  </span>
                  <span className="my-task__title">{task.title}</span>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/projects/${task.projectId}/board`); }}
                    className="hint"
                  >
                    {projectName(task.projectId)}
                  </a>
                  {task.dueDate && (
                    <span className={isOverdue(task.dueDate) && !task.completedAt ? "my-task--overdue" : "hint"}>
                      <Icon name="calendar" size={13} /> {formatDate(task.dueDate, locale)}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="empty">
                <Icon name="kanban" size={28} />
                <p style={{ margin: 0 }}>{t("noMyTasks")}</p>
                <button className="btn" onClick={() => navigate("/projects")}>{t("goProjects")}</button>
              </li>
            )}
          </ul>
        </section>

        <aside className="workbench__side">
          <section className="card">
            <h2 className="section-title"><Icon name="brand" size={15} />{t("myProjects")}</h2>
            <ul className="side-project-list">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <button className="side-project" onClick={() => navigate(`/projects/${p.id}/board`)}>
                    <span>{p.name}</span>
                    <span className="badge">{p.openTaskCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <TaskDialog
        task={openTask}
        statusName={statusName}
        onClose={() => setOpenTask(null)}
      />
    </div>
  );
}
```

注意：`handle.crumb` 直接返回中文字面量（i18n 的 t() 在模块外不可用）；若需要随语言切换，可让 crumb 读 `getLocale()` 后调用 `t("workbench")`——`t` 是从 `~/lib/i18n` 导出的顶层函数，可在 crumb 闭包中直接用：

```typescript
import { t as translate, getLocale } from "~/lib/i18n";
export const handle = { crumb: () => ({ label: translate("workbench") }) };
```

- [ ] **Step 2: global.css 追加工作台样式**

```css
.workbench { display: flex; flex-direction: column; gap: 16px; }
.workbench__hero { display: flex; align-items: center; justify-content: space-between; }
.workbench__body { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
@media (max-width: 900px) { .workbench__body { grid-template-columns: 1fr; } }
.my-task-list { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; }
.my-task {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 10px 8px; border: none; border-bottom: 1px solid var(--color-border);
  background: none; cursor: pointer; color: var(--color-text);
}
.my-task:hover { background: var(--color-bg); }
.my-task__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.my-task--overdue { color: var(--color-danger, #DC2626); display: inline-flex; gap: 4px; align-items: center; }
.side-project-list { list-style: none; padding: 0; margin: 8px 0 0; }
.side-project { display: flex; justify-content: space-between; align-items: center; width: 100%;
  padding: 9px 8px; border: none; background: none; cursor: pointer; border-radius: 6px; color: var(--color-text); }
.side-project:hover { background: var(--color-bg); }
.skeleton { background: linear-gradient(90deg, var(--color-bg), var(--color-border), var(--color-bg));
  background-size: 200% 100%; animation: shimmer 1.2s infinite; border-radius: 8px; }
@keyframes shimmer { to { background-position: -200% 0; } }
```

- [ ] **Step 3: 浏览器验证**

Run: `npm run dev`，检查：问候语、四组标签、任务点击开对话框、项目卡片跳转、空状态按钮。

- [ ] **Step 4: typecheck + 全量测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 通过（24 + 2 tests）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: workbench home with grouped my-tasks and project shortcuts"
```

---

### Task 7: 项目列表页（`/projects`，迁移旧首页）

**Files:**
- Create: `app/routes/_app.projects.tsx`

- [ ] **Step 1: 从旧 `_app._index.tsx`（git 历史里的原 `_index.tsx`）复制项目列表部分**

结构：`useEffect` 加载 `projectRepository.list()` + `session.currentUser()`；渲染 `project-card` 网格（复用现有样式与 ROLE_LABELS）；顶部工具条放"创建演示项目"按钮。不再渲染用户切换 select（已进 UserCard）、通知/设置链接（已进侧栏）。

```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { projectRepository } from "~/repositories/project.repository";
import { session } from "~/auth/session";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { t as translate } from "~/lib/i18n";
import type { Project } from "~/models/project";
import type { User } from "~/models/user";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员", projectAdmin: "项目管理员", member: "成员", guest: "只读访客",
};

export const handle = { crumb: () => ({ label: translate("projects") }) };

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    void (async () => {
      setProjects(await projectRepository.list());
      setMe(await session.currentUser());
    })();
  }, []);

  async function createDemo() {
    const project = await projectRepository.createDemo();
    navigate(`/projects/${project.id}/board`);
  }

  return (
    <div>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("allProjects")}</h1>
        <span className="page-toolbar__spacer" />
        <button className="btn btn--primary" onClick={createDemo}>
          <Icon name="plus" size={16} />
          {t("createDemo")}
        </button>
      </div>
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id}>
            <div
              className="project-card"
              role="button"
              tabIndex={0}
              aria-label={`打开项目 ${p.name}`}
              onClick={() => navigate(`/projects/${p.id}/board`)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(`/projects/${p.id}/board`); }}
            >
              <span className="project-card__name">{p.name}</span>
              <span className="project-card__meta">
                <span>{p.description}</span>
                <span className="badge badge--role">
                  {t("myRole")}：{ROLE_LABELS[p.memberRoles[me?.id ?? ""] ?? ""] ?? "非成员"}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {projects.length === 0 && (
        <div className="empty">
          <Icon name="kanban" size={32} />
          <p style={{ margin: 0 }}>{t("noProjects")}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 浏览器验证**

`/projects` 显示卡片网格、创建演示项目并跳转看板；侧栏"项目"高亮、面包屑显示"项目"。

- [ ] **Step 3: typecheck + 测试 + 构建**

Run: `npx tsc --noEmit && npx vitest run && npx remix vite:build`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add app/routes/_app.projects.tsx
git commit -m "feat: dedicated projects list route"
```

---

### Task 8: 存量页面去除旧页头（notifications / settings / board / list）

**Files:**
- Modify: `app/routes/_app.notifications.tsx`
- Modify: `app/routes/_app.settings.tsx`
- Modify: `app/routes/_app.projects_/$projectId.board.tsx`
- Modify: `app/routes/_app.projects_/$projectId.list.tsx`

- [ ] **Step 1: 各页处理**

- notifications/settings：删除 `page-toolbar` 里的返回按钮（`app-header__back`）与外层 `main.page` 改为 `div`；顶栏返回由面包屑承担
- board/list：删除 `app-header`（返回按钮 + 标题 + segmented），标题与视图切换移入页面顶部工具条；保留 segmented 控件本身
- 每个路由文件追加 `handle` 面包屑：
  - notifications：`export const handle = { crumb: () => ({ label: translate("notifications") }) };`
  - settings：`crumb: () => ({ label: translate("settings") })`
  - board：`crumb: () => ({ label: project?.name ?? "项目", to: "/projects" })`（project 名需运行时取——crumb 是静态 handle，改为在组件内渲染面包屑不可行；方案：board/list 的 `handle` 返回 `{ label: "看板" }` / `{ label: "列表" }`，项目名一级由 projects 路由本身充当：面包屑显示 `项目 / 看板`，点击"项目"回 `/projects`）
- board 面包屑最终：`crumb: () => ({ label: translate("board") })`；list：`crumb: () => ({ label: translate("list") })`

- [ ] **Step 2: 浏览器逐页验证**

侧栏高亮正确、面包屑可点击返回、无双重页头。

- [ ] **Step 3: typecheck + 测试 + 构建**

Run: `npx tsc --noEmit && npx vitest run && npx remix vite:build`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove legacy headers, adopt shell breadcrumbs"
```

---

### Task 9: 阶段验收

- [ ] **Step 1: 全量验证**

Run: `npx tsc --noEmit && npx vitest run && npx remix vite:build`
Expected: 全部通过

- [ ] **Step 2: 手动走查清单**

- `/` 工作台四组标签 + 右侧项目卡 + 空状态
- `/projects` → 项目卡片 → 看板/列表切换 → 面包屑返回
- 通知红点实时（另一标签页造一条通知）
- 侧栏折叠/展开、用户卡片切换身份后页面数据跟随
- 中英切换后侧栏/工作台文案跟随

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: phase 1 complete"
```
