# 阶段二：数据层（软删除/审计/乐观锁）+ 回收站 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task/Project/Comment 支持软删除与级联恢复，所有写操作记审计日志，更新带乐观锁，新增回收站页面；过期条目 30 天自动清理。

**Architecture:** Dexie schema 升级到 version 2（迁移补 `deletedAt: null`），新表 `auditLogs`。repository 层默认过滤软删数据并提供 trash 查询；service 层统一"RBAC → 写库 → 审计 → broadcast"；乐观锁放在 repository.update 的 version 检查。删除/恢复语义全部在 service 层实现级联。

**Tech Stack:** Dexie 4、Zod、Vitest + fake-indexeddb（`fileParallelism: false` 已配置）。

**Spec:** `docs/superpowers/specs/2026-09-15-enterprise-redesign-design.md` 第 3、6 节。

---

### Task 1: 模型与 Dexie 升级（deletedAt + auditLogs 表）

**Files:**
- Modify: `app/models/task.ts`、`app/models/project.ts`、`app/models/comment.ts`
- Create: `app/models/auditLog.ts`
- Modify: `app/repositories/db.ts`

- [ ] **Step 1: 模型追加字段**

`app/models/task.ts` 在 `archived` 之后追加：

```typescript
  deletedAt: z.string().nullable().default(null),
  deletedByProjectId: z.string().nullable().default(null),
```

`app/models/project.ts` 与 `app/models/comment.ts` 在 `version` 之前各追加：

```typescript
  deletedAt: z.string().nullable().default(null),
```

- [ ] **Step 2: 新建 auditLog 模型**

```typescript
import { z } from "zod";

export const auditActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "restore",
  "purge",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditLogSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: auditActionSchema,
  entityType: z.enum(["task", "project", "comment", "user"]),
  entityId: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;
```

- [ ] **Step 3: db.ts 升级 version 2**

```typescript
import type { AuditLog } from "~/models/auditLog";
// class 内：
  auditLogs!: EntityTable<AuditLog, "id">;

  constructor() {
    super("projecthub");
    this.version(1).stores({
      projects: "id, updatedAt",
      tasks: "id, projectId, status, [projectId+status+order], assigneeId, dueDate, priority, archived",
      comments: "id, taskId, createdAt",
      notifications: "id, userId, createdAt",
      users: "id, name",
      preferences: "key",
    });
    this.version(2)
      .stores({
        tasks: "id, projectId, status, [projectId+status+order], assigneeId, dueDate, priority, archived, deletedAt",
        comments: "id, taskId, createdAt, deletedAt",
        projects: "id, updatedAt, deletedAt",
        auditLogs: "id, createdAt, actorId, entityType",
      })
      .upgrade(async (tx) => {
        const now = null;
        await Promise.all(
          [tx.table("tasks"), tx.table("projects"), tx.table("comments")].map(
            async (table) => {
              await table.toCollection().modify((row: Record<string, unknown>) => {
                if (row.deletedAt === undefined) row.deletedAt = now;
                if (table.name === "tasks" && row.deletedByProjectId === undefined) {
                  row.deletedByProjectId = null;
                }
              });
            },
          ),
        );
      });
  }
```

- [ ] **Step 4: typecheck + 现有测试仍绿（旧数据无新字段由 default 兜底）**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 通过（若 settings.tsx 压测种子 rows 缺字段报 TS 错，给 rows 元素加 `deletedAt: null, deletedByProjectId: null`；project.repository.ts createDemo 的任务同理）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: soft-delete fields on models, auditLogs table, dexie v2 migration"
```

---

### Task 2: 审计服务（TDD）

**Files:**
- Create: `app/services/audit.service.ts`
- Test: `tests/audit.service.test.ts`

- [ ] **Step 1: 失败测试**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { auditService } from "../app/services/audit.service";

describe("auditService", () => {
  beforeEach(async () => {
    await db.auditLogs.clear();
  });

  it("记录并按时间倒序列出", async () => {
    await auditService.log("u1", "create", "task", "t1", "创建了任务 A");
    await auditService.log("u1", "delete", "project", "p1", "删除了项目 B");
    const rows = await auditService.list({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.summary).toBe("删除了项目 B"); // 最新的在前
  });

  it("按 entityType 与 actorId 筛选", async () => {
    await auditService.log("u1", "create", "task", "t1", "A");
    await auditService.log("u2", "create", "project", "p1", "B");
    const rows = await auditService.list({ entityType: "project", actorId: "u2" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entityType).toBe("project");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/audit.service.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

```typescript
import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { AuditAction, AuditLog } from "~/models/auditLog";

export interface AuditFilter {
  actorId?: string;
  action?: AuditAction;
  entityType?: AuditLog["entityType"];
  limit?: number;
}

export const auditService = {
  async log(
    actorId: string,
    action: AuditAction,
    entityType: AuditLog["entityType"],
    entityId: string,
    summary: string,
  ): Promise<void> {
    await db.auditLogs.add({
      id: uuid(),
      actorId,
      action,
      entityType,
      entityId,
      summary,
      createdAt: new Date().toISOString(),
    });
  },

  async list(filter: AuditFilter = {}): Promise<AuditLog[]> {
    let table = db.auditLogs.orderBy("createdAt").reverse();
    let rows = await table.limit(filter.limit ?? 50).toArray();
    if (filter.actorId) rows = rows.filter((r) => r.actorId === filter.actorId);
    if (filter.action) rows = rows.filter((r) => r.action === filter.action);
    if (filter.entityType) rows = rows.filter((r) => r.entityType === filter.entityType);
    return rows;
  },
};
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/audit.service.test.ts`
Expected: PASS 2

- [ ] **Step 5: Commit**

```bash
git add app/services/audit.service.ts tests/audit.service.test.ts
git commit -m "feat: audit service with filtering"
```

---

### Task 3: repository 软删过滤 + trash 查询（TDD）

**Files:**
- Modify: `app/repositories/task.repository.ts`、`app/repositories/project.repository.ts`、`app/repositories/comment.repository.ts`
- Test: `tests/softdelete.repository.test.ts`

- [ ] **Step 1: 失败测试**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { taskRepository } from "../app/repositories/task.repository";
import { projectRepository } from "../app/repositories/project.repository";

const now = new Date().toISOString();

async function seedTask(id: string, deletedAt: string | null) {
  await db.tasks.add({
    id, projectId: "p1", title: `任务${id}`, descriptionRich: null, status: "c1",
    assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [],
    order: `a${id}`, archived: false, completedAt: null,
    deletedAt, deletedByProjectId: null,
    createdAt: now, updatedAt: now, version: 0,
  });
}

describe("soft delete filtering", () => {
  beforeEach(async () => {
    await db.tasks.clear();
    await db.projects.clear();
  });

  it("listByProject 默认排除软删，listDeleted 只含软删", async () => {
    await seedTask("t1", null);
    await seedTask("t2", now);
    const live = await taskRepository.listByProject("p1");
    const dead = await taskRepository.listDeleted();
    expect(live.map((t) => t.id)).toEqual(["t1"]);
    expect(dead.map((t) => t.id)).toEqual(["t2"]);
  });

  it("getDeleted 返回软删行", async () => {
    await seedTask("t2", now);
    expect((await taskRepository.getDeleted("t2"))?.id).toBe("t2");
    expect(await taskRepository.getDeleted("t1")).toBeUndefined();
  });

  it("projectRepository.list 排除软删项目", async () => {
    await db.projects.bulkAdd([
      { id: "p1", name: "活", description: "", statusColumns: [], memberRoles: {}, deletedAt: null, createdAt: now, updatedAt: now, version: 0 },
      { id: "p2", name: "死", description: "", statusColumns: [], memberRoles: {}, deletedAt: now, createdAt: now, updatedAt: now, version: 0 },
    ]);
    const list = await projectRepository.list();
    expect(list.map((p) => p.id)).toEqual(["p1"]);
    const deleted = await projectRepository.listDeleted();
    expect(deleted.map((p) => p.id)).toEqual(["p2"]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/softdelete.repository.test.ts`
Expected: FAIL — `listDeleted is not a function`

- [ ] **Step 3: task.repository.ts 改造**

```typescript
// listByProject 内改为：
const rows = await db.tasks.where("projectId").equals(projectId).toArray();
return rows.filter((r) => r.deletedAt === null).map(validate);

// get 保持不变（详情页可能看软删行，由 service 层拦截）。
// 追加：
async listDeleted(): Promise<Task[]> {
  const rows = await db.tasks.where("deletedAt").notEqual("").toArray();
  return rows.filter((r) => r.deletedAt !== null).map(validate);
},
async getDeleted(id: string): Promise<Task | undefined> {
  const row = await db.tasks.get(id);
  return row && row.deletedAt !== null ? validate(row) : undefined;
},
// remove 改为物理删（供 purge 用）：
async purge(id: string): Promise<void> {
  await db.transaction("rw", db.tasks, db.comments, async () => {
    await db.tasks.delete(id);
    await db.comments.where("taskId").equals(id).delete();
  });
},
```

注：`where("deletedAt").notEqual("")` 在 IndexedDB 中不命中 `null` 值，过滤放在内存即可；更简单的是 `db.tasks.toArray()` 后内存过滤（数据量本地演示可接受）：

```typescript
async listDeleted(): Promise<Task[]> {
  const rows = await db.tasks.toArray();
  return rows.filter((r) => r.deletedAt !== null).map(validate);
},
```

- [ ] **Step 4: project.repository.ts / comment.repository.ts 同样处理**

- `projectRepository.list`：`rows.filter((r) => r.deletedAt === null)`；追加 `listDeleted()`（同上内存过滤）
- `commentRepository.listByTask`：过滤 `deletedAt === null`；追加 `listDeleted()`

- [ ] **Step 5: 运行确认通过 + 全量测试**

Run: `npx vitest run`
Expected: 全部通过（工作台 workbenchService 查询也需过滤软删——`db.tasks.toArray()` 后追加 `t.deletedAt === null`、projects 同理，测试若有断言会暴露）

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: repositories filter soft-deleted rows and expose trash queries"
```

---

### Task 4: 删除/恢复/级联 + 乐观锁（TDD）

**Files:**
- Create: `app/services/trash.service.ts`
- Modify: `app/repositories/task.repository.ts`（update 加乐观锁）
- Test: `tests/trash.service.test.ts`

- [ ] **Step 1: 失败测试**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { trashService } from "../app/services/trash.service";
import { VersionConflictError } from "../app/repositories/task.repository";

const now = new Date().toISOString();

async function seed() {
  await db.projects.add({
    id: "p1", name: "项目", description: "", statusColumns: [
      { id: "c1", name: "待办", isDone: false, order: 0 },
    ], memberRoles: {}, deletedAt: null, createdAt: now, updatedAt: now, version: 0,
  });
  await db.tasks.add({
    id: "t1", projectId: "p1", title: "任务", descriptionRich: null, status: "c1",
    assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [],
    order: "a0", archived: false, completedAt: null,
    deletedAt: null, deletedByProjectId: null,
    createdAt: now, updatedAt: now, version: 0,
  });
  await db.comments.add({
    id: "m1", taskId: "t1", authorId: "u1", contentRich: null, mentions: [],
    deletedAt: null, createdAt: now, updatedAt: now, version: 0,
  });
}

describe("trashService", () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.comments.clear(), db.auditLogs.clear()]);
  });

  it("deleteTask 软删并级联软删评论", async () => {
    await seed();
    await trashService.deleteTask("u1", "member", "t1");
    const task = await db.tasks.get("t1");
    const comment = await db.comments.get("m1");
    expect(task?.deletedAt).toBeTruthy();
    expect(comment?.deletedAt).toBeTruthy();
    expect((await db.auditLogs.toArray()).some((a) => a.action === "delete" && a.entityId === "t1")).toBe(true);
  });

  it("guest 无删除权限", async () => {
    await seed();
    await expect(trashService.deleteTask("u1", "guest", "t1")).rejects.toThrow(/权限/);
  });

  it("deleteProject 级联软删任务并标记 deletedByProjectId", async () => {
    await seed();
    await trashService.deleteProject("u1", "admin", "p1");
    expect((await db.projects.get("p1"))?.deletedAt).toBeTruthy();
    const task = await db.tasks.get("t1");
    expect(task?.deletedAt).toBeTruthy();
    expect(task?.deletedByProjectId).toBe("p1");
  });

  it("restoreProject 级联恢复", async () => {
    await seed();
    await trashService.deleteProject("u1", "admin", "p1");
    await trashService.restoreProject("u1", "admin", "p1");
    expect((await db.projects.get("p1"))?.deletedAt).toBeNull();
    expect((await db.tasks.get("t1"))?.deletedAt).toBeNull();
    expect((await db.tasks.get("t1"))?.deletedByProjectId).toBeNull();
  });

  it("restoreTask 只恢复独立删除的任务", async () => {
    await seed();
    await trashService.deleteProject("u1", "admin", "p1");
    await expect(trashService.restoreTask("u1", "member", "t1")).rejects.toThrow(/随项目/);
    await trashService.deleteTask("u1", "member", "t1");
    await trashService.restoreTask("u1", "member", "t1");
    expect((await db.tasks.get("t1"))?.deletedAt).toBeNull();
  });

  it("purgeTask 物理删除", async () => {
    await seed();
    await trashService.deleteTask("u1", "member", "t1");
    await trashService.purgeTask("u1", "t1");
    expect(await db.tasks.get("t1")).toBeUndefined();
    expect(await db.comments.get("m1")).toBeUndefined();
  });
});

describe("optimistic locking", () => {
  beforeEach(async () => {
    await db.tasks.clear();
  });

  it("version 不匹配抛 VersionConflictError", async () => {
    await db.tasks.add({
      id: "t9", projectId: "p1", title: "x", descriptionRich: null, status: "c1",
      assigneeId: null, dueDate: null, priority: "none", labels: [], subtasks: [],
      order: "a0", archived: false, completedAt: null,
      deletedAt: null, deletedByProjectId: null,
      createdAt: now, updatedAt: now, version: 3,
    });
    await expect(
      taskRepository.update("t9", { title: "y" }, 2),
    ).rejects.toThrow(VersionConflictError);
    const row = await db.tasks.get("t9");
    expect(row?.title).toBe("x"); // 未被覆盖
    expect(row?.version).toBe(3);
  });
});
```

（测试顶部需 `import { taskRepository } from "../app/repositories/task.repository";`）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/trash.service.test.ts`
Expected: FAIL — 模块/错误类不存在

- [ ] **Step 3: task.repository.ts 加乐观锁**

```typescript
export class VersionConflictError extends Error {
  constructor(id: string) {
    super(`Task ${id} 已被其他修改更新，请刷新后重试`);
  }
}

// update 签名与实现改为：
async update(id: string, patch: Partial<TaskInput>, expectedVersion?: number): Promise<Task> {
  const existing = await this.get(id);
  if (!existing) throw new Error(`Task ${id} not found`);
  if (expectedVersion !== undefined && expectedVersion !== existing.version) {
    throw new VersionConflictError(id);
  }
  // ……其余不变
},
```

现有调用（task.service.ts 内 moveTask 的 completedAt 更新）不传 version——改为传 `task.version`：`taskRepository.update(taskId, {...}, task.version)`（move 返回的 task 已含最新 version）。

- [ ] **Step 4: trash.service.ts 实现**

```typescript
import { db } from "~/repositories/db";
import { taskRepository } from "~/repositories/task.repository";
import { can, type RoleId } from "~/auth/rbac";
import { auditService } from "./audit.service";

class PermissionError extends Error {}

function assert(role: RoleId, permission: Parameters<typeof can>[1]) {
  if (!can(role, permission)) throw new PermissionError(`角色 ${role} 无 ${permission} 权限`);
}

export const trashService = {
  async deleteTask(actorId: string, actorRole: RoleId, taskId: string): Promise<void> {
    assert(actorRole, "task:delete");
    const task = await db.tasks.get(taskId);
    if (!task || task.deletedAt) return;
    const now = new Date().toISOString();
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.update(taskId, { deletedAt: now, deletedByProjectId: null });
      await db.comments.where("taskId").equals(taskId).modify({ deletedAt: now });
    });
    await auditService.log(actorId, "delete", "task", taskId, `删除了任务「${task.title}」`);
  },

  async restoreTask(actorId: string, actorRole: RoleId, taskId: string): Promise<void> {
    assert(actorRole, "task:delete");
    const task = await db.tasks.get(taskId);
    if (!task) return;
    if (task.deletedByProjectId) {
      throw new Error("该任务随项目删除，请在回收站恢复所属项目");
    }
    await db.transaction("rw", db.tasks, db.comments, async () => {
      await db.tasks.update(taskId, { deletedAt: null });
      await db.comments.where("taskId").equals(taskId).modify({ deletedAt: null });
    });
    await auditService.log(actorId, "restore", "task", taskId, `恢复了任务「${task.title}」`);
  },

  async purgeTask(actorId: string, actorRole: RoleId, taskId: string): Promise<void> {
    assert(actorRole, "task:delete");
    const task = await db.tasks.get(taskId);
    await taskRepository.purge(taskId);
    await auditService.log(actorId, "purge", "task", taskId, `彻底删除了任务「${task?.title ?? taskId}」`);
  },

  async deleteProject(actorId: string, actorRole: RoleId, projectId: string): Promise<void> {
    assert(actorRole, "project:delete");
    const project = await db.projects.get(projectId);
    if (!project || project.deletedAt) return;
    const now = new Date().toISOString();
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      await db.projects.update(projectId, { deletedAt: now });
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        if (t.deletedAt) continue;
        await db.tasks.update(t.id, { deletedAt: now, deletedByProjectId: projectId });
        await db.comments.where("taskId").equals(t.id).modify({ deletedAt: now });
      }
    });
    await auditService.log(actorId, "delete", "project", projectId, `删除了项目「${project.name}」`);
  },

  async restoreProject(actorId: string, actorRole: RoleId, projectId: string): Promise<void> {
    assert(actorRole, "project:delete");
    const project = await db.projects.get(projectId);
    if (!project?.deletedAt) return;
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      await db.projects.update(projectId, { deletedAt: null });
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        if (t.deletedByProjectId !== projectId) continue;
        await db.tasks.update(t.id, { deletedAt: null, deletedByProjectId: null });
        await db.comments.where("taskId").equals(t.id).modify({ deletedAt: null });
      }
    });
    await auditService.log(actorId, "restore", "project", projectId, `恢复了项目「${project.name}」`);
  },

  async purgeProject(actorId: string, actorRole: RoleId, projectId: string): Promise<void> {
    assert(actorRole, "project:delete");
    const project = await db.projects.get(projectId);
    await db.transaction("rw", db.projects, db.tasks, db.comments, async () => {
      const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
      for (const t of tasks) {
        await db.comments.where("taskId").equals(t.id).delete();
        await db.tasks.delete(t.id);
      }
      await db.projects.delete(projectId);
    });
    await auditService.log(actorId, "purge", "project", projectId, `彻底删除了项目「${project?.name ?? projectId}」`);
  },

  async purgeExpired(): Promise<number> {
    const cutoff = Date.now() - 30 * 86400000;
    let count = 0;
    const projects = (await db.projects.toArray()).filter(
      (p) => p.deletedAt && new Date(p.deletedAt).getTime() < cutoff,
    );
    for (const p of projects) {
      await this.purgeProject("system", "admin", p.id);
      count++;
    }
    const tasks = (await db.tasks.toArray()).filter(
      (t) => t.deletedAt && t.deletedByProjectId === null && new Date(t.deletedAt).getTime() < cutoff,
    );
    for (const t of tasks) {
      await this.purgeTask("system", "admin", t.id);
      count++;
    }
    return count;
  },
};
```

**签名约定：** `purgeTask(actorId: string, taskId: string)` 与 `purgeProject(actorId: string, projectId: string)` 不内置权限断言（权限由调用方——UI 的 admin 校验与定时任务——负责），purgeExpired 内部以 `"system"` 作为 actorId 记审计。

- [ ] **Step 5: 运行确认通过 + 全量**

Run: `npx vitest run`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: trash service with cascade soft-delete/restore, optimistic locking"
```

---

### Task 5: 现有 service 接入审计 + 启动清扫

**Files:**
- Modify: `app/services/task.service.ts`、`app/services/comment.service.ts`
- Modify: `app/root.tsx`

- [ ] **Step 1: task.service.ts 接入**

- `create` 成功后：`await auditService.log(actorId, "create", "task", task.id, ...)`。当前 `create` 签名没有 actorId——board 路由持有 `actorId`，把签名改为 `create(actorId: string, actorRole: RoleId, input)`，board 路由调用处同步传 `actorId`。
- `moveTask` 成功后：`await auditService.log(actorId, "update", "task", task.id, \`移动了任务「${task.title}」\`)`
- import：`import { auditService } from "./audit.service";`

- [ ] **Step 2: comment.service.ts 接入**

`create` 成功后追加：

```typescript
await auditService.log(actorId, "create", "comment", comment.id, `评论了任务「${taskTitle}」`);
```

- [ ] **Step 3: root.tsx 启动清扫**

在 `App()` 的 `useEffect` 中：

```typescript
import { trashService } from "~/services/trash.service";

useEffect(() => {
  void initLocale();
  void trashService.purgeExpired();
}, []);
```

- [ ] **Step 4: 全量验证**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 通过（task.service 既有测试的 create 调用签名变化处同步更新）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: audit logging in task/comment services, startup purge sweeper"
```

---

### Task 6: 回收站页面

**Files:**
- Modify: `app/routes/_app.trash.tsx`（替换占位）
- Modify: `app/locales/zh-CN.ts`、`app/locales/en.ts`
- Modify: `app/styles/global.css`

- [ ] **Step 1: i18n 词条**

zh-CN 追加：

```typescript
trashHint: "条目保留 30 天后自动清除",
tabProjects: "项目",
tabTasks: "任务",
tabComments: "评论",
restore: "恢复",
purge: "彻底删除",
confirmPurge: "彻底删除后无法恢复，确定继续？",
deletedAt: "删除时间",
retention: "剩余保留",
purgeForbidden: "仅管理员可彻底删除",
restoreWithProject: "随项目删除，请恢复所属项目",
trashEmpty: "回收站是空的",
```

en 对应：`Trash items are kept for 30 days`、`Projects`、`Tasks`、`Comments`、`Restore`、`Delete permanently`、`Permanent deletion cannot be undone. Continue?`、`Deleted at`、`Remaining`、`Only admins can purge`、`Deleted with its project — restore the project instead`、`Trash is empty`。

- [ ] **Step 2: 回收站页面**

```typescript
import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { session } from "~/auth/session";
import { trashService } from "~/services/trash.service";
import { taskRepository } from "~/repositories/task.repository";
import { projectRepository } from "~/repositories/project.repository";
import { commentRepository } from "~/repositories/comment.repository";
import { formatRelative } from "~/lib/date";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";

export const handle = { crumb: () => ({ label: translate("trash") }) };

type Tab = "projects" | "tasks" | "comments";
const RETAIN_MS = 30 * 86400000;

export default function TrashRoute() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("projects");
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof projectRepository.listDeleted>>>([]);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof taskRepository.listDeleted>>>([]);
  const [comments, setComments] = useState<Awaited<ReturnType<typeof commentRepository.listDeleted>>>([]);
  const [me, setMe] = useState<{ id: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [ps, ts, cs, user, allProjects] = await Promise.all([
        projectRepository.listDeleted(),
        taskRepository.listDeleted(),
        commentRepository.listDeleted(),
        session.currentUser(),
        db.projects.toArray(),
      ]);
      return { ps, ts, cs, user, isAdmin: allProjects.some((p) => p.memberRoles[user.id] === "admin") };
    }).subscribe(({ ps, ts, cs, user, isAdmin }) => {
      setProjects(ps); setTasks(ts); setComments(cs);
      setMe({ id: user.id, isAdmin });
    });
    return () => sub.unsubscribe();
  }, []);

  const rows = useMemo(() => {
    if (tab === "projects") return projects.map((p) => ({ id: p.id, label: p.name, deletedAt: p.deletedAt!, blocked: false, kind: "project" as const }));
    if (tab === "tasks") return tasks.map((tk) => ({ id: tk.id, label: tk.title, deletedAt: tk.deletedAt!, blocked: tk.deletedByProjectId !== null, kind: "task" as const }));
    return comments.map((c) => ({ id: c.id, label: `评论（${c.id.slice(0, 8)}）`, deletedAt: c.deletedAt!, blocked: false, kind: "comment" as const }));
  }, [tab, projects, tasks, comments]);

  async function restore(kind: Tab, id: string) {
    if (kind === "projects") await trashService.restoreProject(me!.id, "admin", id);
    if (kind === "tasks") await trashService.restoreTask(me!.id, "member", id);
  }

  async function purge(kind: Tab, id: string) {
    if (!confirm(t("confirmPurge"))) return;
    if (kind === "projects") await trashService.purgeProject(me!.id, id);
    if (kind === "tasks") await trashService.purgeTask(me!.id, id);
  }

  return (
    <div>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("trash")}</h1>
        <span className="page-toolbar__spacer" />
        <span className="hint">{t("trashHint")}</span>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <nav className="segmented" aria-label={t("trash")}>
          {(["projects", "tasks", "comments"] as Tab[]).map((k) => (
            <button key={k} className={`segmented__item${tab === k ? " segmented__item--active" : ""}`} onClick={() => setTab(k)}>
              {t(k === "projects" ? "tabProjects" : k === "tasks" ? "tabTasks" : "tabComments")}
            </button>
          ))}
        </nav>
        <ul className="trash-list">
          {rows.map((r) => {
            const remain = Math.max(0, Math.ceil((new Date(r.deletedAt).getTime() + RETAIN_MS - Date.now()) / 86400000));
            return (
              <li key={r.id} className="trash-item">
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                <span className="hint">{t("deletedAt")} {formatRelative(r.deletedAt)}</span>
                <span className="trash-item__retain" data-days={remain}>{t("retention")} {remain}d</span>
                <button className="btn" disabled={r.blocked} title={r.blocked ? t("restoreWithProject") : undefined} onClick={() => void restore(tab, r.id)}>
                  <Icon name="back" size={14} />{t("restore")}
                </button>
                <button className="btn btn--danger" disabled={!me?.isAdmin} title={!me?.isAdmin ? t("purgeForbidden") : undefined} onClick={() => void purge(tab, r.id)}>
                  <Icon name="trash" size={14} />{t("purge")}
                </button>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="empty"><Icon name="trash" size={28} /><p style={{ margin: 0 }}>{t("trashEmpty")}</p></li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

注意：restore/purge 的角色参数用当前用户在该项目的实际角色更严谨；MVP 用上面简化值（restore 权限走 `task:delete`，member 即可；purge 的 admin 校验已由 disabled 兜底）。trash.service 的 purge 签名以 Task 4 最终实现为准（`purgeTask(actorId, taskId)`）。

- [ ] **Step 3: CSS 追加**

```css
.trash-list { list-style: none; padding: 0; margin: 12px 0 0; }
.trash-item { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-bottom: 1px solid var(--color-border); }
.trash-item__retain { font-size: 12px; color: var(--color-text-secondary); min-width: 72px; }
```

- [ ] **Step 4: 浏览器验证**

造数：创建演示项目 → 删除任务/项目（本阶段 UI 入口的删除按钮在阶段三，可临时在控制台调 `trashService` 或用 DevTools）→ 回收站出现条目 → 恢复 → 条目消失且原页面可见。

Run: `npm run dev` 手动走查。

- [ ] **Step 5: 全量验证 + Commit**

Run: `npx tsc --noEmit && npx vitest run && npx remix vite:build`

```bash
git add -A && git commit -m "feat: trash page with restore, purge and retention display"
```

---

### Task 7: 阶段验收

- [ ] **Step 1: 全量验证**

Run: `npx tsc --noEmit && npx vitest run && npx remix vite:build`
Expected: 全部通过

- [ ] **Step 2: 手动走查清单**

- 软删任务后看板/列表/工作台不再显示
- 项目删除 → 任务随删 → 恢复项目 → 任务全部回来
- 随项目删除的任务在回收站"恢复"按钮禁用并有提示
- 回收站非 admin 身份"彻底删除"禁用
- 30 天过期条目在刷新页面后被自动清扫（可将 deletedAt 手动改旧验证）
- 另一标签页删除，回收站 liveQuery 实时刷新

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: phase 2 complete"
```
