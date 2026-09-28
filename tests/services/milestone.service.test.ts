import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/repositories/db";
import { milestoneService } from "~/services/milestone.service";
import { milestoneSchema } from "~/models/milestone";

const P = "p1";
const P2 = "p2";

describe("milestoneService", () => {
  beforeEach(async () => {
    await db.milestones.clear();
  });

  it("创建并列出（按日期升序）", async () => {
    await milestoneService.create(P, "发布上线", "2026-10-15T00:00:00");
    await milestoneService.create(P, "需求冻结", "2026-09-30T00:00:00");
    const list = await milestoneService.list(P);
    expect(list).toHaveLength(2);
    expect(list[0]!.title).toBe("需求冻结");
    expect(list[1]!.title).toBe("发布上线");
    expect(milestoneSchema.parse(list[0])).toBeTruthy();
  });

  it("拒绝空标题与空日期", async () => {
    await expect(milestoneService.create(P, "  ", "2026-10-15T00:00:00")).rejects.toThrow();
    await expect(milestoneService.create(P, "标题", "")).rejects.toThrow();
  });

  it("update 切换完成态并回写 updatedAt", async () => {
    const ms = await milestoneService.create(P, "内测", "2026-10-01T00:00:00");
    // 固定时钟避免 create/update 同毫秒导致时间戳比较抖动（只伪造 Date，不伪造定时器）
    vi.useFakeTimers({ now: Date.now() + 10_000, toFake: ["Date"] });
    try {
      await milestoneService.update(ms.id, { doneAt: "2026-10-02T08:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
    let row = await db.milestones.get(ms.id);
    expect(row!.doneAt).toBe("2026-10-02T08:00:00.000Z");
    expect(row!.updatedAt > ms.updatedAt).toBe(true);
    await milestoneService.update(ms.id, { doneAt: null });
    row = await db.milestones.get(ms.id);
    expect(row!.doneAt).toBeNull();
  });

  it("update 拒绝清空标题", async () => {
    const ms = await milestoneService.create(P, "内测", "2026-10-01T00:00:00");
    await expect(milestoneService.update(ms.id, { title: "" })).rejects.toThrow();
  });

  it("remove 删除单个里程碑", async () => {
    const ms = await milestoneService.create(P, "内测", "2026-10-01T00:00:00");
    await milestoneService.remove(ms.id);
    expect(await milestoneService.list(P)).toHaveLength(0);
  });

  it("stripProject 只清理指定项目的里程碑", async () => {
    await milestoneService.create(P, "A", "2026-10-01T00:00:00");
    await milestoneService.create(P2, "B", "2026-10-02T00:00:00");
    await milestoneService.stripProject(P);
    expect(await milestoneService.list(P)).toHaveLength(0);
    expect(await milestoneService.list(P2)).toHaveLength(1);
  });
});
