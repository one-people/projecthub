import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~/repositories/db";
import { flowService } from "~/services/flow.service";

const P = "p1";
const U = "u1";

async function seedProject(id: string) {
  await db.projects.add({
    id, name: `项目${id}`, description: "",
    statusColumns: [{ id: "c1", name: "待办", isDone: false, order: 0 }],
    customFields: [], ownerId: U, memberRoles: {},
    deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 0,
  });
}

async function seedFlow() {
  await flowService.ensure(U, P, "主流程");
}

describe("flowService", () => {
  beforeEach(async () => {
    await db.flows.clear();
    await db.projects.clear();
    await seedProject(P);
  });

  it("ensure 首次建图、再次调用幂等返回同一条", async () => {
    const a = await flowService.ensure(U, P, "主流程");
    const b = await flowService.ensure(U, P, "另一名字");
    expect(a.id).toBe(b.id);
    expect((await db.flows.toArray())).toHaveLength(1);
  });

  it("addNode 落库；空文字回退为类型名", async () => {
    await seedFlow();
    const n1 = await flowService.addNode(U, P, { kind: "process", x: 10, y: 10, w: 144, h: 56, text: "审批" });
    const n2 = await flowService.addNode(U, P, { kind: "start", x: 0, y: 0, w: 96, h: 40, text: "  " });
    const flow = await flowService.getByProject(P);
    expect(flow!.nodes).toHaveLength(2);
    expect(flow!.nodes.find((n) => n.id === n1.id)!.text).toBe("审批");
    expect(flow!.nodes.find((n) => n.id === n2.id)!.text).toBe("start");
  });

  it("moveNode/renameNode 更新节点；rename 拒绝空文字", async () => {
    await seedFlow();
    const n = await flowService.addNode(U, P, { kind: "process", x: 0, y: 0, w: 144, h: 56, text: "A" });
    await flowService.moveNode(U, P, n.id, 120, 80);
    await flowService.renameNode(U, P, n.id, "审批通过");
    let flow = await flowService.getByProject(P);
    expect(flow!.nodes[0]).toMatchObject({ x: 120, y: 80, text: "审批通过" });
    await expect(flowService.renameNode(U, P, n.id, " ")).rejects.toThrow(/不能为空/);
    flow = await flowService.getByProject(P);
    expect(flow!.nodes[0]!.text).toBe("审批通过");
  });

  it("removeNode 级联删除其所有连线", async () => {
    await seedFlow();
    const a = await flowService.addNode(U, P, { kind: "start", x: 0, y: 0, w: 96, h: 40, text: "开始" });
    const b = await flowService.addNode(U, P, { kind: "process", x: 200, y: 0, w: 144, h: 56, text: "B" });
    const c = await flowService.addNode(U, P, { kind: "end", x: 400, y: 0, w: 96, h: 40, text: "结束" });
    await flowService.connect(U, P, a.id, b.id);
    await flowService.connect(U, P, b.id, c.id);
    expect((await flowService.getByProject(P))!.edges).toHaveLength(2);
    await flowService.removeNode(U, P, b.id);
    const flow = await flowService.getByProject(P);
    expect(flow!.nodes.map((n) => n.id)).toEqual([a.id, c.id]);
    expect(flow!.edges).toHaveLength(0);
  });

  it("connect 拒绝自环与不存在端点；重复连线去重", async () => {
    await seedFlow();
    const a = await flowService.addNode(U, P, { kind: "start", x: 0, y: 0, w: 96, h: 40, text: "A" });
    const b = await flowService.addNode(U, P, { kind: "end", x: 200, y: 0, w: 96, h: 40, text: "B" });
    await expect(flowService.connect(U, P, a.id, a.id)).rejects.toThrow(/自身/);
    await expect(flowService.connect(U, P, a.id, "ghost")).rejects.toThrow(/不存在/);
    await flowService.connect(U, P, a.id, b.id, "通过");
    await flowService.connect(U, P, a.id, b.id);
    const flow = await flowService.getByProject(P);
    expect(flow!.edges).toHaveLength(1);
    expect(flow!.edges[0]!.label).toBe("通过");
  });

  it("setEdgeLabel/removeEdge 编辑与删除连线", async () => {
    await seedFlow();
    const a = await flowService.addNode(U, P, { kind: "start", x: 0, y: 0, w: 96, h: 40, text: "A" });
    const b = await flowService.addNode(U, P, { kind: "end", x: 200, y: 0, w: 96, h: 40, text: "B" });
    await flowService.connect(U, P, a.id, b.id);
    const edge = (await flowService.getByProject(P))!.edges[0]!;
    await flowService.setEdgeLabel(U, P, edge.id, "  是  ");
    expect((await flowService.getByProject(P))!.edges[0]!.label).toBe("是");
    await flowService.removeEdge(U, P, edge.id);
    expect((await flowService.getByProject(P))!.edges).toHaveLength(0);
  });

  it("图不存在时写操作报错；非成员（无 task:update）被拒绝", async () => {
    await expect(flowService.addNode(U, P, { kind: "process", x: 0, y: 0, w: 144, h: 56, text: "A" }))
      .rejects.toThrow(/不存在/);
    await seedFlow();
    await expect(flowService.addNode("u-outsider", P, { kind: "process", x: 0, y: 0, w: 144, h: 56, text: "A" }))
      .rejects.toThrow(/权限/);
  });
});
