import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { assertProjectPermission } from "~/auth/assert";
import { flowSchema, type Flow, type FlowNode, type FlowNodeKind } from "~/models/flow";

/**
 * 流程图服务：编辑权限沿用 task:update（流程图与任务同为成员协作内容，访客只读）。
 * 每个项目一张图，节点/连线整存整取；无软删除——画布编辑是高频小步操作，删除即时生效。
 */
export const flowService = {
  async getByProject(projectId: string): Promise<Flow | null> {
    const row = await db.flows.where("projectId").equals(projectId).first();
    return row ? flowSchema.parse(row) : null;
  },

  /** 首次进入自动建图；已存在则原样返回（幂等） */
  async ensure(actorId: string, projectId: string, name: string): Promise<Flow> {
    const existing = await this.getByProject(projectId);
    if (existing) return existing;
    await assertProjectPermission(projectId, actorId, "task:update");
    const now = new Date().toISOString();
    const flow: Flow = flowSchema.parse({
      id: uuid(),
      projectId,
      name: name.trim() || "Flow",
      nodes: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
    });
    await db.flows.add(flow);
    return flow;
  },

  async addNode(
    actorId: string,
    projectId: string,
    node: Pick<FlowNode, "kind" | "x" | "y" | "w" | "h" | "text">,
  ): Promise<FlowNode> {
    await assertProjectPermission(projectId, actorId, "task:update");
    const flow = await this.requireByProject(projectId);
    const next: FlowNode = { id: uuid(), ...node, text: node.text.trim() || node.kind };
    await db.flows.update(flow.id, {
      nodes: [...flow.nodes, next],
      updatedAt: new Date().toISOString(),
    });
    return next;
  },

  async moveNode(actorId: string, projectId: string, nodeId: string, x: number, y: number): Promise<void> {
    await assertProjectPermission(projectId, actorId, "task:update");
    const flow = await this.requireByProject(projectId);
    await db.flows.update(flow.id, {
      nodes: flow.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
      updatedAt: new Date().toISOString(),
    });
  },

  async renameNode(actorId: string, projectId: string, nodeId: string, text: string): Promise<void> {
    await assertProjectPermission(projectId, actorId, "task:update");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("节点文字不能为空");
    const flow = await this.requireByProject(projectId);
    await db.flows.update(flow.id, {
      nodes: flow.nodes.map((n) => (n.id === nodeId ? { ...n, text: trimmed } : n)),
      updatedAt: new Date().toISOString(),
    });
  },

  /** 删除节点并级联移除其所有连线 */
  async removeNode(actorId: string, projectId: string, nodeId: string): Promise<void> {
    await assertProjectPermission(projectId, actorId, "task:update");
    const flow = await this.requireByProject(projectId);
    await db.flows.update(flow.id, {
      nodes: flow.nodes.filter((n) => n.id !== nodeId),
      edges: flow.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      updatedAt: new Date().toISOString(),
    });
  },

  async connect(
    actorId: string,
    projectId: string,
    from: string,
    to: string,
    label = "",
  ): Promise<void> {
    await assertProjectPermission(projectId, actorId, "task:update");
    if (from === to) throw new Error("连线不能指向自身");
    const flow = await this.requireByProject(projectId);
    const has = flow.nodes.some((n) => n.id === from) && flow.nodes.some((n) => n.id === to);
    if (!has) throw new Error("连线端点节点不存在");
    if (flow.edges.some((e) => e.from === from && e.to === to)) return; // 去重
    await db.flows.update(flow.id, {
      edges: [...flow.edges, { id: uuid(), from, to, label }],
      updatedAt: new Date().toISOString(),
    });
  },

  async setEdgeLabel(actorId: string, projectId: string, edgeId: string, label: string): Promise<void> {
    await assertProjectPermission(projectId, actorId, "task:update");
    const flow = await this.requireByProject(projectId);
    await db.flows.update(flow.id, {
      edges: flow.edges.map((e) => (e.id === edgeId ? { ...e, label: label.trim() } : e)),
      updatedAt: new Date().toISOString(),
    });
  },

  async removeEdge(actorId: string, projectId: string, edgeId: string): Promise<void> {
    await assertProjectPermission(projectId, actorId, "task:update");
    const flow = await this.requireByProject(projectId);
    await db.flows.update(flow.id, {
      edges: flow.edges.filter((e) => e.id !== edgeId),
      updatedAt: new Date().toISOString(),
    });
  },

  async requireByProject(projectId: string): Promise<Flow> {
    const flow = await this.getByProject(projectId);
    if (!flow) throw new Error("流程图不存在");
    return flow;
  },
};

/** 供 palette/快捷创建使用的默认尺寸（px，画布坐标） */
export const FLOW_NODE_SIZE: Record<FlowNodeKind, { w: number; h: number }> = {
  start: { w: 96, h: 40 },
  end: { w: 96, h: 40 },
  process: { w: 144, h: 56 },
  decision: { w: 128, h: 88 },
  io: { w: 144, h: 56 },
};
