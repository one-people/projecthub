import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/repositories/db";
import { milestoneService } from "~/services/milestone.service";
import { milestoneSchema } from "~/models/milestone";

const P = "p1";
const P2 = "p2";
const U = "u1";

async function seedProject(id: string) {
  await db.projects.add({
    id, name: `项目${id}`, description: "",
    statusColumns: [{ id: "c1", name: "待办", isDone: false, order: 0 }],
    customFields: [], ownerId: U, memberRoles: {},
    deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 0,
  });
}

describe("milestoneService", () => {
  beforeEach(async () => {
    await db.milestones.clear();
    await db.projects.clear();
    await seedProject(P);
    await seedProject(P2);
  });

  it("创建并列出（按日期升序）", async () => {
    await milestoneService.create(U, P, "发布上线", "2026-10-15T00:00:00");
    await milestoneService.create(U, P, "需求冻结", "2026-09-30T00:00:00");
    const list = await milestoneService.list(P);
    expect(list).toHaveLength(2);
    expect(list[0]!.title).toBe("需求冻结");
    expect(list[1]!.title).toBe("发布上线");
    expect(milestoneSchema.parse(list[0])).toBeTruthy();
  });

  it("拒绝空标题与空日期", async () => {
    await expect(milestoneService.create(U, P, "  ", "2026-10-15T00:00:00")).rejects.toThrow();
    await expect(milestoneService.create(U, P, "标题", "")).rejects.toThrow();
  });

  it("非成员（无 milestone:manage）被拒绝", async () => {
    await expect(milestoneService.create("u-outsider", P, "越权", "2026-10-15T00:00:00")).rejects.toThrow(/权限/);
  });

  it("update 切换完成态并回写 updatedAt", async () => {
    const ms = await milestoneService.create(U, P, "内测", "2026-10-01T00:00:00");
    // 固定时钟避免 create/update 同毫秒导致时间戳比较抖动（只伪造 Date，不伪造定时器）
    vi.useFakeTimers({ now: Date.now() + 10_000, toFake: ["Date"] });
    try {
      await milestoneService.update(U, ms.id, { doneAt: "2026-10-02T08:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
    let row = await db.milestones.get(ms.id);
    expect(row!.doneAt).toBe("2026-10-02T08:00:00.000Z");
    expect(row!.updatedAt > ms.updatedAt).toBe(true);
    await milestoneService.update(U, ms.id, { doneAt: null });
    row = await db.milestones.get(ms.id);
    expect(row!.doneAt).toBeNull();
  });

  it("update 拒绝清空标题", async () => {
    const ms = await milestoneService.create(U, P, "内测", "2026-10-01T00:00:00");
    await expect(milestoneService.update(U, ms.id, { title: "" })).rejects.toThrow();
  });

  it("remove 删除单个里程碑", async () => {
    const ms = await milestoneService.create(U, P, "内测", "2026-10-01T00:00:00");
    await milestoneService.remove(U, ms.id);
    expect(await milestoneService.list(P)).toHaveLength(0);
  });

  it("stripProject 只清理指定项目的里程碑", async () => {
    await milestoneService.create(U, P, "A", "2026-10-01T00:00:00");
    await milestoneService.create(U, P2, "B", "2026-10-02T00:00:00");
    await milestoneService.stripProject(P);
    expect(await milestoneService.list(P)).toHaveLength(0);
    expect(await milestoneService.list(P2)).toHaveLength(1);
  });
});
