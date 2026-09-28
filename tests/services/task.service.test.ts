import { describe, expect, it } from "vitest";
import { generateKeyBetween } from "~/lib/fractional-index";
import { can } from "~/auth/rbac";

describe("fractional indexing", () => {
  it("首个 key", () => {
    expect(typeof generateKeyBetween(null, null)).toBe("string");
  });

  it("生成的 key 严格递增（追加到末尾）", () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    const c = generateKeyBetween(b, null);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it("在两个 key 之间生成新 key", () => {
    const a = generateKeyBetween(null, null);
    const c = generateKeyBetween(a, null);
    const b = generateKeyBetween(a, c);
    expect(a < b && b < c).toBe(true);
  });
});

describe("RBAC", () => {
  it("管理员拥有全部权限", () => {
    expect(can("admin", "task:delete")).toBe(true);
    expect(can("admin", "project:create")).toBe(true);
  });

  it("成员不能管理项目", () => {
    expect(can("member", "project:delete")).toBe(false);
  });

  it("只读访客只能查看", () => {
    expect(can("guest", "task:read")).toBe(true);
    expect(can("guest", "task:update")).toBe(false);
    expect(can("guest", "comment:create")).toBe(false);
  });
});
