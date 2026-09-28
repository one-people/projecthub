import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { taskLinkService, LinkError } from "~/services/taskLink.service";

const P = "p1";
const U = "u1";

async function seedProject() {
  await db.projects.clear();
  await db.projects.add({
    id: P, name: "项目", description: "",
    statusColumns: [{ id: "c1", name: "待办", isDone: false, order: 0 }],
    customFields: [], ownerId: U, memberRoles: {},
    deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 0,
  });
}

async function addLink(from: string, to: string, type: "blocks" | "relates" = "blocks") {
  return taskLinkService.add(U, { projectId: P, fromTaskId: from, toTaskId: to, type });
}

describe("taskLinkService", () => {
  beforeEach(async () => {
    await db.taskLinks.clear();
    await seedProject();
  });

  it("创建并列出关联", async () => {
    await addLink("a", "b");
    await addLink("b", "c", "relates");
    const links = await taskLinkService.list(P);
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.type).sort()).toEqual(["blocks", "relates"]);
  });

  it("拒绝自关联", async () => {
    await expect(addLink("a", "a")).rejects.toBeInstanceOf(LinkError);
    await expect(addLink("a", "a")).rejects.toMatchObject({ code: "self" });
  });

  it("任意方向已关联则拒绝（含 relates 反向）", async () => {
    await addLink("a", "b", "relates");
    await expect(addLink("b", "a", "relates")).rejects.toMatchObject({ code: "exists" });
    await expect(addLink("a", "b", "blocks")).rejects.toMatchObject({ code: "exists" });
  });

  it("blocks 成环检测：a→b、b→c 后拒绝 c→a", async () => {
    await addLink("a", "b");
    await addLink("b", "c");
    await expect(addLink("c", "a")).rejects.toMatchObject({ code: "cycle" });
    // 非环方向可以添加
    await expect(addLink("a", "c")).resolves.toBeTruthy();
  });

  it("反向 blocks 被任意方向唯一性拦截", async () => {
    await addLink("a", "b");
    await expect(addLink("b", "a")).rejects.toMatchObject({ code: "exists" });
  });

  it("relates 不参与成环检测", async () => {
    await addLink("a", "b", "relates");
    await addLink("b", "c", "relates");
    await expect(addLink("c", "a", "relates")).resolves.toBeTruthy();
  });

  it("remove 删除关联；stripTask 清掉触及任务的所有关联", async () => {
    const l1 = await addLink("a", "b");
    await addLink("b", "c");
    await taskLinkService.remove(U, l1.id);
    expect(await taskLinkService.list(P)).toHaveLength(1);
    await taskLinkService.stripTask("b");
    expect(await taskLinkService.list(P)).toHaveLength(0);
  });
});
