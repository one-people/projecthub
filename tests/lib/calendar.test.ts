import { describe, expect, it } from "vitest";
import { buildMonthGrid, dateKey, isOverdue, isoToDateKey, localMidnightIso } from "~/lib/calendar";

describe("dateKey / iso 转换", () => {
  it("dateKey 输出本地 yyyy-mm-dd", () => {
    expect(dateKey(new Date(2026, 8, 5))).toBe("2026-09-05");
    expect(dateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("isoToDateKey 与 localMidnightIso 互为往返", () => {
    const iso = localMidnightIso("2026-09-28");
    expect(isoToDateKey(iso)).toBe("2026-09-28");
  });

  it("UTC 时间按本地时区归到正确的日期", () => {
    // 本地 2026-09-01 08:00 对应的 ISO 在任何时区都应回到 09-01（本地零点构造）
    const iso = new Date(2026, 8, 1, 8, 0, 0).toISOString();
    expect(isoToDateKey(iso)).toBe("2026-09-01");
  });
});

describe("buildMonthGrid", () => {
  it("返回 42 格且首格为周一", () => {
    const grid = buildMonthGrid(2026, 8); // 2026-09
    expect(grid).toHaveLength(42);
    expect(grid[0]!.date.getDay()).toBe(1);
    expect(grid[0]!.key).toBe("2026-08-31"); // 9/1 是周二，起点为前一周周一
  });

  it("相邻格恰好相差一天", () => {
    const grid = buildMonthGrid(2027, 0); // 跨年月份
    for (let i = 1; i < grid.length; i++) {
      const diff = grid[i]!.date.getTime() - grid[i - 1]!.date.getTime();
      expect(diff).toBe(86400000);
    }
  });

  it("inMonth 标记只覆盖当月天数", () => {
    const grid = buildMonthGrid(2026, 1); // 2026-02，28 天
    const inMonth = grid.filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(inMonth[0]!.key).toBe("2026-02-01");
    expect(inMonth.at(-1)!.key).toBe("2026-02-28");
  });

  it("今天所在格带 isToday", () => {
    const now = new Date();
    const grid = buildMonthGrid(now.getFullYear(), now.getMonth());
    const todays = grid.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
  });
});

describe("isOverdue", () => {
  const today = dateKey(new Date());
  const tomorrow = localMidnightIso(
    dateKey(new Date(Date.now() + 86400000)),
  );
  const yesterday = localMidnightIso(
    dateKey(new Date(Date.now() - 86400000)),
  );

  it("无截止日期或已完成不算逾期", () => {
    expect(isOverdue({ dueDate: null, completedAt: null }, today)).toBe(false);
    expect(isOverdue({ dueDate: yesterday, completedAt: new Date().toISOString() }, today)).toBe(false);
  });

  it("截止日在今天之后不算逾期", () => {
    expect(isOverdue({ dueDate: tomorrow, completedAt: null }, today)).toBe(false);
  });

  it("截止日早于今天且未完成为逾期", () => {
    expect(isOverdue({ dueDate: yesterday, completedAt: null }, today)).toBe(true);
  });
});
