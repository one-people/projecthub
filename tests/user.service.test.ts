import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "../app/repositories/db";
import { userService } from "../app/services/user.service";

const now = new Date().toISOString();

describe("userService", () => {
  beforeEach(async () => {
    await db.users.clear();
    await db.auditLogs.clear();
    await db.users.add({ id: "u1", name: "管理员", email: "", avatarColor: "#3B82F6", active: true, createdAt: now });
  });

  it("非 admin 不能创建用户", async () => {
    await expect(
      userService.create("u1", "member", { name: "新用户", email: "a@b.c", avatarColor: "#10B981" }),
    ).rejects.toThrow(/权限/);
  });

  it("admin 创建用户并写审计", async () => {
    const u = await userService.create("u1", "admin", { name: "新用户", email: "a@b.c", avatarColor: "#10B981" });
    expect(u.id).toBeTruthy();
    expect(
      (await db.auditLogs.toArray()).some((a) => a.entityType === "user" && a.entityId === u.id),
    ).toBe(true);
  });

  it("停用后 active 为 false，数据保留", async () => {
    await userService.deactivate("u1", "admin", "u1");
    const row = await db.users.get("u1");
    expect(row?.active).toBe(false);
    expect(row).toBeTruthy();
  });
});
