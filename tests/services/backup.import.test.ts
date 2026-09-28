import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { backupService } from "~/services/backup.service";

const now = new Date().toISOString();

/** v3 及更早备份：projects 无 ownerId，角色可能为 projectAdmin */
function oldBackup() {
  return JSON.stringify({
    app: "projecthub",
    schemaVersion: 3,
    exportedAt: now,
    tables: {
      projects: [
        {
          id: "p1",
          name: "旧项目",
          description: "",
          statusColumns: [{ id: "c1", name: "待办", isDone: false, order: 0 }],
          customFields: [],
          memberRoles: { u1: "projectAdmin", u2: "member" },
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 0,
        },
      ],
      tasks: [],
      comments: [],
      users: [],
      labels: [],
    },
  });
}

describe("backupService.importAll 旧格式归一化", () => {
  beforeEach(async () => {
    await Promise.all([db.projects.clear(), db.tasks.clear(), db.comments.clear(), db.users.clear(), db.labels.clear()]);
  });

  it("v3 备份导入：projectAdmin→admin、回填 ownerId（首位 admin）", async () => {
    const { imported } = await backupService.importAll(oldBackup());
    expect(imported).toBe(1);
    const p = await db.projects.get("p1");
    expect(p?.memberRoles).toEqual({ u1: "admin", u2: "member" });
    expect(p?.ownerId).toBe("u1");
  });

  it("再次导出包含 ownerId，往返无损", async () => {
    await backupService.importAll(oldBackup());
    await backupService.importAll(await backupService.exportAll());
    const p = await db.projects.get("p1");
    expect(p?.ownerId).toBe("u1");
    expect(p?.memberRoles.u1).toBe("admin");
  });
});
