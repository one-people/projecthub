import { describe, expect, it } from "vitest";
import {
  statusColor,
  avatarColor,
  activeFilterChips,
} from "~/lib/list-view";
import { EMPTY_FILTERS } from "~/components/list/FilterBar";

describe("statusColor", () => {
  it("同一列 id 返回同一颜色", () => {
    expect(statusColor("col-1")).toBe(statusColor("col-1"));
  });
  it("不同列 id 大概率返回不同颜色", () => {
    const set = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(statusColor));
    expect(set.size).toBeGreaterThan(1);
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
  it("每个激活筛选产生一个 chip（key/label/value）", () => {
    const chips = activeFilterChips(
      { ...EMPTY_FILTERS, assigneeId: "u1", status: "done" },
      opts,
    );
    expect(chips).toEqual([
      { key: "assigneeId", label: "负责人", value: "张三" },
      { key: "status", label: "状态", value: "已完成" },
    ]);
  });
});
