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
