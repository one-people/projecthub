import { describe, expect, it } from "vitest";
import { can, resolveRole } from "~/auth/rbac";

describe("resolveRole", () => {
  const project = {
    ownerId: "u1",
    memberRoles: { u1: "admin", u2: "member", u3: "guest" } as Record<string, string>,
  };

  it("ownerId 命中即所有者", () => {
    expect(resolveRole(project, "u1")).toBe("owner");
  });

  it("成员按 memberRoles 解析", () => {
    expect(resolveRole(project, "u2")).toBe("member");
    expect(resolveRole(project, "u3")).toBe("guest");
  });

  it("非成员返回 null（不再默认 member）", () => {
    expect(resolveRole(project, "u9")).toBeNull();
  });

  it("未知角色字符串视为非成员", () => {
    expect(resolveRole({ ownerId: "", memberRoles: { u4: "projectAdmin" } }, "u4")).toBeNull();
  });

  it("所有者权限高于成员项（ownerId 优先）", () => {
    const ownerAlsoMember = { ownerId: "u1", memberRoles: { u1: "guest" } };
    const role = resolveRole(ownerAlsoMember, "u1");
    expect(role).toBe("owner");
    expect(role && can(role, "project:delete")).toBe(true);
  });
});
