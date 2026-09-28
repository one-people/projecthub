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
  it("所有者拥有全部权限（含删除项目）", () => {
    expect(can("owner", "task:delete")).toBe(true);
    expect(can("owner", "project:delete")).toBe(true);
  });

  it("管理员可管理项目但不能删除", () => {
    expect(can("admin", "project:update")).toBe(true);
    expect(can("admin", "member:manage")).toBe(true);
    expect(can("admin", "project:delete")).toBe(false);
  });

  it("成员不能管理项目", () => {
    expect(can("member", "project:delete")).toBe(false);
    expect(can("member", "project:update")).toBe(false);
  });

  it("只读访客只能查看", () => {
    expect(can("guest", "task:read")).toBe(true);
    expect(can("guest", "task:update")).toBe(false);
    expect(can("guest", "comment:create")).toBe(false);
  });
});
