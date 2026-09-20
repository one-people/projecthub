import { describe, expect, it } from "vitest";
import {
  statusColor,
  avatarColor,
  activeFilterChips,
  PALETTE,
} from "~/lib/list-view";
import { EMPTY_FILTERS } from "~/lib/list-view";

describe("statusColor", () => {
  it("返回固定的确切颜色", () => {
    expect(statusColor("col-1")).toBe("#BE185D");
    expect(statusColor("col-2")).toBe("#1D4ED8");
    expect(statusColor("col-3")).toBe("#4D7C0F");
  });
  it("输入 a..h 的结果都在调色板内，且包含确切值", () => {
    const results = ["a", "b", "c", "d", "e", "f", "g", "h"].map(statusColor);
    for (const c of results) expect(PALETTE).toContain(c);
    expect(statusColor("a")).toBe("#0F766E");
    expect(statusColor("b")).toBe("#B45309");
    expect(statusColor("c")).toBe("#7C3AED");
  });
});

describe("avatarColor", () => {
  it("返回合法 hex 颜色", () => {
    expect(avatarColor("张三")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("activeFilterChips", () => {
  const opts = [{ id: "u1", name: "张三" }];
  it("无筛选时返回空数组", () => {
    expect(activeFilterChips(EMPTY_FILTERS, opts)).toEqual([]);
  });
  it("每个激活筛选产生一个 chip（key/labelKey/valueKey）", () => {
    const chips = activeFilterChips(
      { ...EMPTY_FILTERS, assigneeId: "u1", status: "done" },
      opts,
    );
    expect(chips).toEqual([
      { key: "assigneeId", labelKey: "colAssignee", value: "张三" },
      { key: "status", labelKey: "colStatus", value: "done", valueKey: "statusDone" },
    ]);
  });
  it("未知负责人 id 回退为 i18n key「unknownUser」", () => {
    const chips = activeFilterChips(
      { ...EMPTY_FILTERS, assigneeId: "nope" },
      opts,
    );
    expect(chips).toEqual([
      { key: "assigneeId", labelKey: "colAssignee", value: "unknownUser", valueKey: "unknownUser" },
    ]);
  });
  it("未知 due 值回退为原始字符串", () => {
    const chips = activeFilterChips(
      { ...EMPTY_FILTERS, due: "custom" as never },
      opts,
    );
    expect(chips).toEqual([
      { key: "due", labelKey: "colDueDate", value: "custom", valueKey: undefined },
    ]);
  });
});
