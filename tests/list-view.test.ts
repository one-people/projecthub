import { describe, expect, it } from "vitest";
import { statusColor, avatarColor, PALETTE } from "~/lib/list-view";

describe("statusColor", () => {
  it("返回固定的确切颜色", () => {
    expect(statusColor("col-1")).toBe("#BE185D");
    expect(statusColor("col-2")).toBe("#4F46E5");
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

